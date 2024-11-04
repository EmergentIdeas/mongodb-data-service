const AbstractDataService = require('@dankolz/abstract-data-service')

let genBsonId

try {
	const {ObjectId} = require('bson')
	genBsonId = (val) => {
		let id = new ObjectId(val)
		return {
			_id: id
		}
	}

}
catch(e) {
	genBsonId = (val) => {
		return {
			_id: {
				id: Buffer.from(val, "hex"),
				_bsontype: "ObjectID",
			}
		}

	}

}

class MongoDataService extends AbstractDataService {

	/**
	 * 
	 * @param {object} options
 	 * @param {string} [options.serviceName] Sets the name of this service for logging, and possibly other purposes
 	 * @param {boolean} [options.useIndependentIds] If true, records will get unique ID strings which are not tied to the underylying datastore
 	 * @param {object} options.collections an object holding the MongoDB collections this service will use, keyed by collection name
 	 * @param {object} [options.collections.default] the default collection. Technically optional, but the basic functions which
	 * don't require the caller to specify the collection won't work if not set.
	 * @param {EventEmitter} [options.notification] An EventEmitter that will be notified on create, update, and delete. The notification is:
	 * emit('object-change', { the object }, changeType: create, update, delete)
	 * @param {string} [options.eventName] The event name which will be used for the emitter. By default this is 'object-change'.
	 * 
	 */
	constructor(options = {}) {
		super(options)
		Object.assign(this, arguments[0])
	}
	
	/**
	 * Creates an object to query the db by an object's ID
	 * @param {*} id 
	 * @returns 
	 */
	createIdQuery(id) {
		if (Array.isArray(id)) {
			let subqueries = id.map(singleId => this.createIdQuery(singleId))
			let query = {
				$or: subqueries
			}
			return query
		}
		else {
			if(typeof id == 'object') {
				return id
			}
			let query;
			if(typeof id == 'string' && id.length == 24) {
				query = genBsonId(id)
				// query._id[Symbol.for('@@mdb.bson.version')] = 5
			}
			else {
				query = {
					_id: id
				}

			}
			if(this.useIndependentIds && typeof id == 'string') {
				query = {
					$or: [
						query,
						{
							id: id
						}
					]
				}
			}
			
			return query
		}
	}

	async _doInternalFetch(collection, query) {
		return collection.find(query).toArray()
	}

	async _doInternalRemove(collection, query) {
		return collection.deleteMany(query)
	}

	async _doInternalSave(collection, focus) {
		let p = new Promise((resolve, reject) => {
			if (focus._id) {
				let options = {
					upsert: true,
				}
				let id = focus._id
				collection.replaceOne({_id: id}, focus, options).then(result => {
					if(result.ops) {
						return resolve([result.ops[0], 'update', result])
					}
					else {
						return resolve([focus, 'update', result])
					}
				}).catch(err => {
					this.log.error({
						error: err
					})
					return reject(err)
				})
			}
			else {
				collection.insertOne(focus).then(result => {
					if(result.ops) {
						return resolve([result.ops[0], 'create', result])
					}
					else {
						return resolve([focus, 'create', result])
					}
				}).catch(err => {
					this.log.error({
						error: err
					})
					return reject(err)
				})
			}
		})
		return p
	}

	/**
	 * Saves a bunch of previously unsaved objects all in one go. 
	 * @param {MongoDB collection} collection 
	 * @param {Array(objects)} foci 
	 * @returns An array of promises, one for each object
	 */
	_doInternalMultiInsert(collection, foci) {
		// for(let focus of foci) {
		// 	if(this.useIndependentIds && !focus.id) {
		// 		focus.id = this.generateId()
		// 	}
		// }	
		let promises = []
		let resolves = []
		let rejects = []

		for(let i = 0; i < foci.length; i++) {
			let focus = foci[i]
			if(this.useIndependentIds && !focus.id) {
				focus.id = this.generateId()
			}
			let prom = new Promise((resolve, reject) => {
				resolves.push(resolve)
				rejects.push(reject)
			})
			promises.push(prom)
		}
		
		collection.insertMany(foci).then(result => {
			let saved = result.ops || foci
			for(let i = 0; i < saved.length; i++) {
				let focus = saved[i]
				this._notify(focus, 'create')
				let resolve = resolves[i]
				resolve([focus, 'create', result])

			}
		}).catch(err => {
			this.log.error({
				error: err
			})
			for(let reject of rejects) {
				reject(err)
			}
		})
		return promises
	}
	
	/**
	 * Saves an array of objects. If the objects already have an _id attribute, it replaces the existing document, otherwise inserts it.
	 * @param {Collection} collection A MongoDB Collection
	 * @param {object[]} foci An array of objects to save
	 * @param {function} callback (optional) A callback if that's how you get down. Called when Promise.all is done. This function would normally be used with promises and await.
	 * @returns Array An array of promises which represent saves for each object in the array. If you want to wait on the results, try:
	 * 		Promise.all(service._saveMany(col, items)).then(result => {
	 * 			// some code
	 * 		})
	 * 	or
	 * 		await Promise.all(service._saveMany(col, items))
	 */
	_saveMany(collection, foci, callback) {
		let promises = []
		
		let multiInsertRecords = []
		let singleInsertRecords = []
		
		for(let focus of foci) {
			if(focus._id) {
				singleInsertRecords.push(focus)
			}
			else {
				multiInsertRecords.push(focus)
			}
		}
		
		if(multiInsertRecords.length > 0) {
			let proms = this._doInternalMultiInsert(collection, multiInsertRecords)
			promises.push(...proms)
		}
		for(let focus of singleInsertRecords) {
			promises.push(this._save(collection, focus))
		}	
		if(callback) {
			addCallbackToPromise(Promise.all(promises), callback)
		}	
		return promises
	}

}

module.exports = MongoDataService
