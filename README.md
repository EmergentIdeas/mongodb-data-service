# mongodb-data-service

A fairly thin layer over a mongodb collection(s).

A couple reasons to use it / a couple reasons I wrote it.

1. Emits events for add, change, and delete events. Handy for caching or kicking off
long running processes.
2. Has hooks for processing records loaded which allows additional data to be
added, data to be removed, encryption/decryption, or recreating the objects as 
a certain class before returning them.
3. A little help in querying by id.
4. A nice starting point to create complex services objects.
5. Just enough of an abstraction so that I'll be able to use the same interface
for something like indexeddb, remote rest calls over http, or a file based store.
6. By default adds a unique id so that it's more consistent and the objects more
referenceable in data stores which don't have mongo's strong unique keys.



## Install

```
npm i @dankolz/mongodb-data-service
```

## Usage

```
const MongoDataService = require('@dankolz/mongodb-data-service')
const { MongoClient } = require("mongodb")

let uri = "mongodb://localhost:27017"
const client = new MongoClient(uri)
await client.connect()
let collection = client.db('test').collection('testcollection')
let events = new EventEmitter()

let dataService = new MongoDataService({
	collections: {
		default: collection
	}
	, notification: events
})

```


Lots of js doc on the methods themselves, and the test cases call them for illustration, but
for a short look at how it works.


### Data persistence usage

The `save` call returns a promise which resolves to an array of objects. The first is the
saved object (including any id attributes added). The second is the native result that
mongodb returns. Save works for both insertion and document update, deciding which to
use on the basis of the existance of the _id attribute.


```
let [r] = await dataService.save({msg: 'hello world'})
```

Loading a record by id is straightfoward. The method accepts a BSON ObjectId, a string
which it will try to turn into an ObjectId, the unique identifier string it creates and
assigns to the id attribute, or a normal mongo query. If an object is passed as a query
it won't even attempt to do any of the id processing stuff.


```
let result = await dataService.fetchOne(r.id)
result = await dataService.fetchOne(r._id)
```

Getting multiple results is almost exactly like mongo. Pass an object as a query, get an
array of matches back, or an empty array of there are no matches.


```
result = await dataService.fetch({name: 'Kolz'})
```

Loading multiple objects by id with the sort of help given with the fetchOne function is
like:


```
result = await dataService.fetch(dataService.createIdQuery(['abc', '123']))
```

Saving multiple objects has the save behavior as calling `save` in a loop. It returns an
array of promises, each of the type returned by `save`.

```
let promises = dataService.saveMany([
	{msg: 'hello'}
	, {msg: 'world'}
])
await Promise.all(promises)
```



### Events usuage

Add a listenter to the emitter:

```
events.on('object-change', (one, two) => {
	console.log(`object change: ${JSON.stringify(one)} ${two}`)
})
```
