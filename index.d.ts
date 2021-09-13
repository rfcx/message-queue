import SQS from 'aws-sdk/clients/sqs'

declare module '@rfcx/message-queue' {
  function MessageHandler(message: object): boolean
  interface MessageQueueOptions {
    queuePrefix?: string
  }
  class MessageQueue {
    constructor(clientType: string, options?: MessageQueueOptions)
    queuePrefix: string
    client: unknown
    queueName(): string
    publish(eventName: string, message: unknown): void
    subscribe(eventName: string, messageHandler: typeof MessageHandler): boolean
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
}
