A simple wrapper on top of message queues.

## Usage example for SQS
```
import { MessageQueue } from '@rfcx/message-queue'

const options = {
  ...
}
const messageQueue = new MessageQueue('sqs', options)

messageQueue.publish('publication-queue', { foo: 'bar' })

messageQueue.subscribe('subscription-queue', (message: unknown) => {
  return true
})
```

## Usage example for SNS
```
import { MessageQueue } from '@rfcx/message-queue'

const options = {
  ...
}
const messageQueue = new MessageQueue('sns', options)

messageQueue.publish('publication-topic', { foo: 'bar' })
```

## API

### `new MessageQueue(type, options)`

Creates a new MessageQueue client.

#### Options

* `type` - _String_ - client type (`sqs` or `sns`)
* `options` - _Object_ - additional options
* `options.topicPrefix` - _String_ - SQS queue or SNS topic prefix (e.g. `staging` in `staging-event-created`)
* `options.topicPostfix` - _String_ - SQS queue or SNS topic postfix (e.g. `staging` in `event-created-staging`)


## Environmental variables

For `SQS` client: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_KEY`, `AWS_REGION_ID`

For `SNS` client: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_KEY`, `AWS_REGION_ID`, `AWS_ACCOUNT_ID`

`MESSAGE_QUEUE_ENDPOINT` if you want to use custom `endpoint`

## Additional notes

- Note that `SNS` client does not have `subscribe` method as you can't subscribe directly to `SNS` topic.
