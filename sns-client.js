const SNS = require('aws-sdk/clients/sns')

class SNSMessageQueueClient {
  /**
   * Create an SNS client
   * @param {unknown} client
   * @param {*} options Additional configuration to pass to AWS SQS client
   */
  constructor (options = {}) {
    if (process.env.AWS_ACCOUNT_ID === undefined) {
      throw new Error('"AWS_ACCOUNT_ID" env var is required for "SNS" client')
    }
    this.sns = new SNS({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_KEY,
      region: process.env.AWS_REGION_ID,
      ...options
    })
    this.cachedTopicArns = {}
  }

  async createTopic (name) {
    const topic = await this.sns.createTopic({ Name: name }).promise()
    return topic.TopicArn
  }

  combineTopicArn (name) {
    return `arn:aws:sns:${process.env.AWS_REGION_ID}:${process.env.AWS_ACCOUNT_ID}:${name}`
  }

  async topicArn (name) {
    if (!this.cachedTopicArns[name]) {
      const arn = this.combineTopicArn(name)
      await this.sns.getTopicAttributes({ TopicArn: arn }).promise()
        .catch((e) => {
          if (e.code === 'NotFound') {
            return this.createTopic(name)
          }
        })
      this.cachedTopicArns[name] = arn
    }

    if (this.cachedTopicArns[name] === undefined) {
      throw new Error('Unable to get TopicArn from SNS')
    }

    return this.cachedTopicArns[name]
  }

  async publish (topicName, message) {
    const payload = {
      Message: JSON.stringify(message),
      TopicArn: await this.topicArn(topicName)
    }
    return await this.sns.publish(payload).promise()
  }

  async subscribe (topicName, messageHandler) {
    throw new Error('"subscribe" method does not exist for "SNS" client')
  }
}

module.exports = SNSMessageQueueClient
