import EventEmitter from 'events'
import test from "node:test"
import assert from "node:assert"


import { MongoClient, ServerApiVersion, ObjectId } from "mongodb"
import DataService from '../mongodb-data-service.js'

let collectionName = 'col' + (new Date()).getTime()
function show(dat) {
	console.log(JSON.stringify(dat, null, '\t'))

}

await test("basic data operations", async function (t) {
	let uri = "mongodb://localhost:27017"
	const client = new MongoClient(uri)


	let col
	let serv

	await t.test("connect", async function () {
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
	await t.test("independent ids", function () {
		let serv = new DataService({
			collections: {
				default: col
			}
		})
		assert.equal(serv.useIndependentIds, true)
		
		let id = serv.generateId()
		assert(id != null)

		serv = new DataService({
			collections: {
				default: col
			}
			, useIndependentIds: false
		})
		assert.equal(serv.useIndependentIds, false)

	})

	await t.test("ops", async function () {
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
					// console.log(`object change: ${JSON.stringify(one)} ${two}`)
				})

				let dat = {
					msg: 'hello'
				}
				let [r] = await serv.save(Object.assign({}, dat))
				assert(r._id != null)
				// Make sure we have an independent id
				assert(r.id != null)
				let id = r._id
				let id2 = r.id

				let result = await serv.fetch()
				assert.equal(result.length, 1)

				result = await serv.fetchOne(id)
				assert.equal(result.msg, 'hello')

				result = await serv.fetchOne(id.toString())
				assert.equal(result.msg, 'hello')
				
				result.msg = 'hi'
				let o = await serv.save(result)
				
				result = await serv.fetchOne(id.toString())
				assert.equal(result.msg, 'hi')

				result = await serv.fetchOne({id: id2})
				assert.equal(result.msg, 'hi')

				result = await serv.fetchOne(id2)
				assert.equal(result.msg, 'hi')

				result = await serv.remove(id.toString())

				result = await serv.fetchOne(id.toString())
				assert(result == null)
				
				
				let promises = serv.saveMany([
					{msg: 'hello'}
					, {msg: 'world'}
				])
				o = await Promise.all(promises)

				result = await serv.fetch()
				assert.equal(result.length, 2)
				
				let ids = result.map(item => item.id)
				let ids2 = result.map(item => item._id.toString())
				
				result = await serv.fetch({id: {$in: ids}})
				assert.equal(result.length, 2)
				
				result = await serv.fetchOne(ids)
				assert(result != null)

				result = await serv.fetchOne(ids2)
				assert(result != null)
				
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
				assert(r._id != null)
				// Make sure we don't have an independent id
				assert(r.id == undefined)
				

			}
			catch(e) {
				console.log(e)
				return reject('error')
			}
			resolve()
		})
		return p
	})
	await t.test("cleanup", async function () {
		let p = new Promise(async (resolve, reject) => {
			await col.drop()
			await client.close()
			resolve()
		})
		return p
	})
})
