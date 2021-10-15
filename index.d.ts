import SQS from 'aws-sdk/clients/sqs'
import SNS from 'aws-sdk/clients/sns'

declare module '@rfcx/message-queue' {
  function MessageHandler(message: any): boolean | Promise<boolean>
  type clientType = 'sns' | 'sqs'
  interface MessageQueueOptions {
    topicPrefix?: string
    topicPostfix?: string
  }
  class SQSMessageQueueClient {
    constructor(options: object)
    sqs: SQS
    cachedQueueUrls: object
    createQueue(queueName: string): Promise<String>
    queueUrl(queueName: string): Promise<String>
    publish(queueName: string, message: unknown): Promise<SQS.Types.SendMessageResult>
    subscribe(queueName: string, messageHandler: typeof MessageHandler): void
  }
  class SNSMessageQueueClient {
    constructor(options: object)
    sns: SNS
    cachedTopicArns: object
    createTopic(name: string): Promise<string>
    combineTopicArn(name: string): string
    topicArn(name: string): string
    publish(topicName: string, message: unknown): Promise<SNS.Types.PublishResponse>
    subscribe(topicName: string, messageHandler: typeof MessageHandler): void
  }
  class MessageQueue {
    constructor(clientType: clientType, options?: MessageQueueOptions)
    topicPrefix?: string
    topicPostfix?: string
    client: SQSMessageQueueClient | SNSMessageQueueClient
    queueName(): string
    publish(eventName: string, message: unknown): void
    subscribe(eventName: string, messageHandler: typeof MessageHandler): boolean
  }
}
