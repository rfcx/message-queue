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

  async _ensureQueue (queueName) {
    if (this._assertedQueues.has(queueName)) return
    const channel = await this._getChannel()
    await channel.assertQueue(queueName, { durable: true })
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
