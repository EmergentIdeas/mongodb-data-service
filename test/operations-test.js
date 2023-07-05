require('mocha')
var expect = require('chai').expect
var assert = require('chai').assert
const tu = (one, two) => one * two
const EventEmitter = require('events')

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb")
const DataService = require('../mongodb-data-service')

let collectionName = 'col' + (new Date()).getTime()
function show(dat) {
	console.log(JSON.stringify(dat, null, '\t'))

}

describe("basic data operations", async function () {
	let uri = "mongodb://localhost:27017"
	const client = new MongoClient(uri)


	let col
	let serv

	it("connect", async function () {
		let p = new Promise(async (resolve, reject) => {
			await client.connect()
			col = client.db('test').collection(collectionName)
			// await col.insertOne({
			// 	msg: 'hello'
			// })
			// let result = await col.find({}).toArray()
			// console.log(result)
			resolve()
		})
		return p
	})
	it("independent ids", function () {
		serv = new DataService({
			collections: {
				default: col
			}
		})
		assert.equal(serv.useIndependentIds, true)
		
		let id = serv.generateId()
		assert.isNotNull(id)

		serv = new DataService({
			collections: {
				default: col
			}
			, useIndependentIds: false
		})
		assert.equal(serv.useIndependentIds, false)

	})

	it("ops", async function () {
		let p = new Promise(async (resolve, reject) => {
			try {
				let events = new EventEmitter()
				serv = new DataService({
					collections: {
						default: col
					}
					, notification: events
				})
				
				events.on('object-change', (one, two) => {
					console.log(`object change: ${JSON.stringify(one)} ${two}`)
				})

				let dat = {
					msg: 'hello'
				}
				let [r] = await serv.save(Object.assign({}, dat))
				console.log(r)
				assert.isNotNull(r._id)
				// Make sure we have an independent id
				assert.isNotNull(r.id)
				let id = r._id
				let id2 = r.id

				let result = await serv.fetch()
				assert.equal(result.length, 1)

				result = await serv.fetchOne(id)
				assert.equal(result.msg, 'hello')

				result = await serv.fetchOne(id.toString())
				assert.equal(result.msg, 'hello')
				
				result.msg = 'hi'
				await serv.save(result)
				
				result = await serv.fetchOne(id.toString())
				assert.equal(result.msg, 'hi')

				result = await serv.fetchOne({id: id2})
				assert.equal(result.msg, 'hi')

				result = await serv.fetchOne(id2)
				assert.equal(result.msg, 'hi')

				result = await serv.remove(id.toString())

				result = await serv.fetchOne(id.toString())
				assert.isNull(result)
				
				
				let promises = serv.saveMany([
					{msg: 'hello'}
					, {msg: 'world'}
				])
				await Promise.all(promises)

				result = await serv.fetch()
				assert.equal(result.length, 2)
				
				let ids = result.map(item => item.id)
				let ids2 = result.map(item => item._id.toString())
				
				result = await serv.fetch({id: {$in: ids}})
				assert.equal(result.length, 2)
				
				result = await serv.fetchOne(ids)
				assert.isNotNull(result)

				result = await serv.fetchOne(ids2)
				assert.isNotNull(result)
				
				result = await serv.fetch(serv.createIdQuery(ids))
				assert.equal(result.length, 2)

				result = await serv.fetch(serv.createIdQuery(ids2))
				assert.equal(result.length, 2)
				
				result = await serv.fetch({name: 'Kolz'})
				assert.equal(result.length, 0)


				// with independent ids turned off
				serv.useIndependentIds = false
				let native
				[r, native] = await serv.save({msg: 'world'})
				assert.isNotNull(r._id)
				// Make sure we don't have an independent id
				assert.isUndefined(r.id)
				

			}
			catch(e) {
				console.log(e)
				return reject('error')
			}
			resolve()
		})
		return p
	})
	it("cleanup", async function () {
		let p = new Promise(async (resolve, reject) => {
			await col.drop()
			await client.close()
			resolve()
		})
		return p
	})
})
