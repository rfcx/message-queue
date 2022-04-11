/**
 * Generic message queue
 * @class
 * */
 class MessageQueue {
  /**
   * Create a message queue, injecting a client (e.g. SQS)
   * @param {string} clientType - client type (currently available only 'sqs')
   * @param {*} options
   * @param {string} options.topicPrefix topic name prefix
   * @param {string} options.topicPostfix topic name postfix
   */
  constructor (clientType, options = {}) {
    let client
    const baseOpts = {
      endpoint: process.env.MESSAGE_QUEUE_ENDPOINT
    }
    if (clientType === 'sqs') {
      client = new (require('./sqs-client'))(baseOpts)
    } else if (clientType === 'sns') {
      client = new (require('./sns-client'))(baseOpts)
    } else {
      throw new Error('MessageQueue clientType is not supported')
    }
    this.topicPrefix = options.topicPrefix
    this.topicPostfix = options.topicPostfix
    this.client = client
  }

  queueName (eventName) {
    const prefix = this.topicPrefix ? `${this.topicPrefix}-` : ''
    const postfix = this.topicPostfix ? `-${this.topicPostfix}` : ''
    return `${prefix}${eventName}${postfix}`
  }

  /**
   * Append a message to the queue
   *
   * @param {string} eventName
   * @param {*} message
   */
  async publish (eventName, message) {
    const queue = this.queueName(eventName)

    console.info(`Message Queue: ${queue}: Publishing ${JSON.stringify(message)}`)
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
      console.info(`Message Queue: ${queue}: Receiving ${JSON.stringify(message)}`)
      return messageHandler(message)
    })
  }
}

module.exports = {
  MessageQueue
}
