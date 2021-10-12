A simple wrapper above message queues like AWS SQS.

## Usage example
```
import { MessageQueue } from '@rfcx/message-queue'

const messageQueue = new MessageQueue('sqs', { endpoint: 'some-endpoint })

messageQueue.publish('publication-queue', 'some-message')

messageQueue.subscribe('subscription-queue', (message: unknown) => {
  return true
})
```
