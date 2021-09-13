const SQS = require('aws-sdk/clients/sqs')
const { Consumer } = require('sqs-consumer')

const defaultQueueOptions = {
  VisibilityTimeout: '120'
}

class SQSMessageQueueClient {
  /**
   * Create an SQS client
   * @param {unknown} client
   * @param {*} options Additional configuration to pass to AWS SQS client
   */
  constructor (options = {}) {
    this.sqs = new SQS({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_KEY,
      region: process.env.AWS_REGION_ID,
      ...options
    })
    this.cachedQueueUrls = {}
  }

  async createQueue (queueName) {
    // Create deadletter queue
    const deadletterQueueName = `${queueName}-deadletter`
    const deadletterQueue = await this.sqs.createQueue({ QueueName: deadletterQueueName }).promise()

    const attributesRequest = { QueueUrl: deadletterQueue.QueueUrl, AttributeNames: ['QueueArn'] }
    const deadletterQueueAttributes = (await this.sqs.getQueueAttributes(attributesRequest).promise()).Attributes

    // Create queue which redirects failed messages to deadletter queue
    const attributes = {
      RedrivePolicy: JSON.stringify({
        deadLetterTargetArn: deadletterQueueAttributes.QueueArn,
        maxReceiveCount: '3'
      }),
      ...defaultQueueOptions
    }
    const queue = await this.sqs.createQueue({ QueueName: queueName, Attributes: attributes }).promise()
    return queue.QueueUrl
  }

  async queueUrl (queueName) {
    if (!this.cachedQueueUrls[queueName]) {
      const result = await this.sqs.getQueueUrl({ QueueName: queueName }).promise()
        .then(queue => queue.QueueUrl)
        .catch(e => {
          if (e.code === 'AWS.SimpleQueueService.NonExistentQueue') {
            return this.createQueue(queueName)
          }
          throw e
        })
      this.cachedQueueUrls[queueName] = result
    }

    if (this.cachedQueueUrls[queueName] === undefined) {
      throw new Error('Unable to get QueueUrl from SQS')
    }

    return this.cachedQueueUrls[queueName]
  }

  async publish (queueName, message) {
    const payload = {
      MessageBody: JSON.stringify(message),
      QueueUrl: await this.queueUrl(queueName)
    }
    await this.sqs.sendMessage(payload).promise()
  }

  async subscribe (queueName, messageHandler) {
    const queueUrl = await this.queueUrl(queueName)
    const handleMessage = async (message) => {
      const body = JSON.parse(message.Body)
      try {
        await messageHandler(body)
      } catch (e) {
        console.error(e)
        return false
      }
      return true
    }
    const options = {
      batchSize: 10,
      pollingWaitTimeMs: 1000,
      sqs: this.sqs
    }
    const consumer = Consumer.create({ queueUrl, handleMessage, ...options })

    consumer.on(['error', 'processing_error', 'timeout_error'], (err) => {
      console.error('Message Queue SQS consumer', err.message)
    })

    consumer.start()
  }
}

module.exports = SQSMessageQueueClient
