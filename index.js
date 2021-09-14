/**
 * Generic message queue
 * @class
 * */
class MessageQueue {
  /**
   * Create a message queue, injecting a client (e.g. SQS)
   * @param {string} clientType - client type (currently available only 'sqs')
   * @param {*} options
   * @param {string} options.queuePrefix Defaults to "testing"
   */
  constructor (clientType, options = {}) {
    let client
    if (clientType === 'sqs') {
      client = new (require('./sqs-client'))({ endpoint: process.env.MESSAGE_QUEUE_ENDPOINT })
    } else {
      throw new Error('MessageQueue clientType is not supported')
    }
    this.queuePrefix = options.queuePrefix || 'testing'
    this.client = client
  }

  queueName (eventName) {
    return `${this.queuePrefix}-${eventName}`
  }

  /**
   * Append a message to the queue
   *
   * @param {string} eventName
   * @param {*} message
   */
  async publish (eventName, message) {
    const queue = this.queueName(eventName)

    console.info(`Message Queue: ${queue}: Publishing`, message)
    try {
      await this.client.publish(queue, message)
    } catch (err) {
      console.error(`Message Queue: ${queue}: Failed to publish "${err.message}"`)
    }
  }

  /**
   * Callback from subscribing to a message queue, one call per message
   * @async
   * @callback MessageHandler
   * @param {*} message
   * @return {boolean} true if the message was handled successfully (and can be deleted from the queue)
   */
  /**
   * Subscribe to receive messages from the queue
   * @param {string} eventName
   * @param {MessageHandler} messageHandler
   */
  subscribe (eventName, messageHandler) {
    const queue = this.queueName(eventName)
    this.client.subscribe(queue, (message) => {
      console.info(`Message Queue: ${queue}: Receiving`, message)
      return messageHandler(message)
    })
  }
}

module.exports = {
  MessageQueue
}
