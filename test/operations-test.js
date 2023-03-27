require('mocha')
var expect = require('chai').expect
var assert = require('chai').assert
const tu = (one, two) => one * two
const EventEmitter = require('events')

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb")
const DataService = require('../mongodb-data-service')

let collectionName = 'col' + (new Date()).getTime()

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
				let r = await serv.save(dat)
				let id = r.insertedId
				// console.log(id)
				assert.isNotNull(id)
				// console.log(dat)

				let result = await serv.fetch()
				assert.equal(result.length, 1)
				// console.log(result)

				result = await serv.fetchOne(id)
				// console.log(result)
				assert.equal(result.msg, 'hello')

				result = await serv.fetchOne(id.toString())
				// console.log(result)
				assert.equal(result.msg, 'hello')
				
				result.msg = 'hi'
				await serv.save(result)
				
				result = await serv.fetchOne(id.toString())
				assert.equal(result.msg, 'hi')

				result = await serv.remove(id.toString())
				// console.log(result)

				result = await serv.fetchOne(id.toString())
				assert.isNull(result)
				
				

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