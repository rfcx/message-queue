const amqplib = require('amqplib')

/**
 * RabbitMQ client for @rfcx/message-queue.
 *
 * Semantics mirror the SQS client as closely as possible:
 *
 *   publish(queueName, message)
 *     - asserts a durable queue named `queueName`
 *     - sends `JSON.stringify(message)` to it with persistent delivery
 *
 *   subscribe(queueName, handler)
 *     - asserts the same durable queue
 *     - consumes one message at a time (prefetch: 1) so concurrent workers
 *       share the load like SQS visibility-timeout semantics
 *     - if `handler` returns truthy (or doesn't throw), the message is acked
 *     - if `handler` returns falsy or throws, the message is nacked WITHOUT
 *       requeue, sending it to the dead-letter exchange if one is bound
 *       (or just dropping it if not — same as SQS without a redrive policy)
 *
 * Configuration via env vars:
 *
 *   RABBITMQ_URL                e.g. amqp://user:pass@rabbitmq.data.svc.cluster.local:5672
 *                               (or the legacy AMQP_URL — checked as fallback)
 *
 *   MESSAGE_QUEUE_PREFIX        existing option; used as queue-name prefix
 *
 * The client maintains a single shared connection. On connection errors it
 * logs and lets the next publish/subscribe call lazily reconnect.
 */
class RabbitMQMessageQueueClient {
  constructor (options = {}) {
    this.options = options
    this.url = process.env.RABBITMQ_URL || process.env.AMQP_URL || options.endpoint
    if (!this.url) {
      throw new Error('RabbitMQ client requires RABBITMQ_URL (or AMQP_URL) env var')
    }
    this._connection = null
    this._channel = null
    this._assertedQueues = new Set()
  }

  async _getChannel () {
    if (this._channel) return this._channel
    if (!this._connection) {
      this._connection = await amqplib.connect(this.url)
      this._connection.on('error', (err) => {
        console.error('Message Queue RabbitMQ connection error', err && err.message)
      })
      this._connection.on('close', () => {
        this._connection = null
        this._channel = null
        this._assertedQueues.clear()
      })
    }
    this._channel = await this._connection.createChannel()
    this._channel.on('error', (err) => {
      console.error('Message Queue RabbitMQ channel error', err && err.message)
    })
    this._channel.on('close', () => {
      this._channel = null
      this._assertedQueues.clear()
    })
    return this._channel
  }

  /**
   * Verify a queue exists WITHOUT asserting anything about how it is declared.
   *
   * 2026-09-08: this used `assertQueue(queueName, { durable: true })`, which
   * declares a CLASSIC queue (no x-queue-type). Queues in this fleet are
   * created centrally from platform/rabbitmq/definitions.json, and most are
   * QUORUM. Re-declaring a quorum queue as classic makes the broker reject the
   * declare:
   *
   *   PRECONDITION_FAILED - inequivalent arg 'x-queue-type' for queue
   *   'classifierJobFinished': received none but current is the value 'quorum'
   *
   * The broker then CLOSES THE CHANNEL, the rejection escapes as an unhandled
   * rejection, and the consumer process exits. Measured effect before this fix:
   * `classifierJobFinished` had ZERO consumers (its events went unprocessed)
   * and core-tasks sat at 1/2 replicas, restarting for days.
   *
   * The bug was ORDER-DEPENDENT and so looked intermittent: `segmentCreated`
   * happens to be classic live, so its declare matched and it subscribed fine;
   * the very next queue was quorum and killed the process.
   *
   * WHY NOT just pass x-queue-type: 'quorum': definitions.json declares 27
   * CLASSIC queues (every *-dlq) alongside 59 quorum ones, so hardcoding either
   * type mis-declares the other set. A client cannot know the right answer.
   *
   * `checkQueue` is a PASSIVE declare: it verifies existence and asserts
   * nothing about arguments, so it cannot mismatch by construction. The
   * platform definition stays the single source of truth.
   *
   * NOTE: a failed checkQueue also closes the channel (AMQP semantics), so the
   * cached channel is dropped before rethrowing; the next call reconnects.
   */
  async _ensureQueue (queueName) {
    if (this._assertedQueues.has(queueName)) return
    const channel = await this._getChannel()
    try {
      await channel.checkQueue(queueName)
    } catch (err) {
      // The broker closes the channel on a failed passive declare; make sure we
      // do not hand the dead channel to the next caller.
      this._channel = null
      this._assertedQueues.clear()
      const e = new Error(
        `Message Queue: queue '${queueName}' is not available on the broker ` +
        '(it must be created by the platform queue definitions before use). ' +
        `Underlying error: ${err && err.message ? err.message : err}`
      )
      e.queueName = queueName
      e.cause = err
      throw e
    }
    this._assertedQueues.add(queueName)
  }

  async publish (queueName, message) {
    const channel = await this._getChannel()
    await this._ensureQueue(queueName)
    const payload = Buffer.from(JSON.stringify(message))
    const ok = channel.sendToQueue(queueName, payload, { persistent: true, contentType: 'application/json' })
    if (!ok) {
      // sendToQueue returns false when the internal buffer is full; wait for drain.
      await new Promise((resolve) => channel.once('drain', resolve))
    }
    return { queueName, bytes: payload.length }
  }

  async subscribe (queueName, messageHandler) {
    const channel = await this._getChannel()
    await this._ensureQueue(queueName)
    await channel.prefetch(1)
    await channel.consume(queueName, async (msg) => {
      if (msg === null) return // consumer cancelled by server
      let body
      try {
        body = JSON.parse(msg.content.toString('utf8'))
      } catch (e) {
        console.error(`Message Queue ${queueName}: bad JSON, dropping:`, e && e.message)
        channel.nack(msg, false, false)
        return
      }
      try {
        const result = await messageHandler(body)
        if (result === false) {
          channel.nack(msg, false, false)
        } else {
          channel.ack(msg)
        }
      } catch (e) {
        console.error(`Message Queue ${queueName}: handler threw, nacking:`, e && e.message)
        channel.nack(msg, false, false)
      }
    })
  }
}

module.exports = RabbitMQMessageQueueClient
