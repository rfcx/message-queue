const { MessageQueue } = require('.')
const SqsClient = require('./sqs-client')
jest.mock('./sqs-client')

beforeEach(() => {
  // Clear all instances and calls to constructor and all methods:
  SqsClient.mockClear();
});

describe('Publish', () => {
  test('Publish is called once', async () => {
    const messageQueue = new MessageQueue('sqs')
    await messageQueue.publish('hello world', {})
    expect(messageQueue.client.publish).toHaveBeenCalledTimes(1)
  })

  test('Payload is published', async () => {
    const topicPrefix = 'core'
    const messageQueue = new MessageQueue('sqs', { topicPrefix })
    const payload = { x: 5, y: 'strawberries' }

    await messageQueue.publish('eat', payload)
    expect(messageQueue.client.publish.mock.calls[0][1]).toEqual(payload)
  })

  test('Topic prefix is configurable', async () => {
    const topicPrefix = 'core'
    const messageQueue = new MessageQueue('sqs', { topicPrefix })
    const eventName = 'eat'
    const payload = { x: 5, y: 'strawberries' }
    await messageQueue.publish(eventName, payload)
    expect(messageQueue.client.publish.mock.calls[0][0]).toBe(`${topicPrefix}-${eventName}`)
  })
})

describe('Subscribe', () => {
  test('Handler is called once', () => {
    const messageQueue = new MessageQueue('sqs')
    const messageHandler = jest.fn((message) => Promise.resolve(true))
    messageQueue.client.subscribe = (queueName, handler) => {
      handler({ x: 'Hello', y: 47 })
    }
    messageQueue.subscribe('hello', messageHandler)
    expect(messageHandler).toHaveBeenCalledTimes(1)
  })
})
