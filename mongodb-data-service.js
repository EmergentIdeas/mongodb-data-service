const filog = require('filter-log')
const addCallbackToPromise = require('add-callback-to-promise')


class DataService {

	/**
	 * 
	 * @param {object} options
 	 * @param {string} options.serviceName [o] Sets the name of this service for logging, and possibly other purposes
 	 * @param {object} options.collections an object holding the MongoDB collections this service will use, keyed by collection name
 	 * @param {object} options.collections.default [o] the default collection. Technically optional, but the basic functions which
	 * don't require the caller to specify the collection won't work if not set.
	 * @param {EventEmitter} options.notification [o] An EventEmitter that will be notified on create, update, and delete. The notification is:
	 * emit('object-change', { the object }, changeType: create, update, delete)
	 * 
	 */
	constructor({serviceName = 'dataService'}) {
		Object.assign(this, {
			log: filog(serviceName + ':')
			, collections: []
		}, arguments[0])
	}
	
	/**
	 * Finds documents via a MongoDB query object
	 * @param {object} query 
	 * @returns An array of resultant objects, possibly empty.
	 */
	async fetch(query) {
		return this._fetchByQuery(this.collections.default, query)
	}
	
	/**
	 * Fetch a single document.
	 * @param {*} id A query or a string which is the id
	 * @returns Either a single document or null
	 */
	async fetchOne(id) {
		let items = await this._fetchById(this.collections.default, id)
		if(items && items.length > 0) {
			return items[0]
		}
		return null
	}
	/**
	 * Store a document. It will replace or insert if there's no _id member
	 * @param {*} focus 
	 * @returns A promise that resolves to the saved object
	 */
	async save(focus) {
		return this._save(this.collections.default, focus) 
	}
	/**
	 * Stores an array of documents. Returns an array of promises.
	 * @param {array} foci 
	 * @returns 
	 */
	async saveMany(foci) {
		return this._saveMany(this.collections.default, foci) 
	}
	/**
	 * Removes one of more documents. This assumes the id is actually just an id,
	 * but will work fine if a broader query is passed.
	 * @param {*} id A query or a string which is the id
	 * @returns 
	 */
	async remove(id) {
		return this._removeByQuery(this.collections.default, this.createIdQuery(id))
	}

	/**
	 * Creates an object to query the db by an object's ID
	 * @param {*} id 
	 * @returns 
	 */
	createIdQuery(id) {
		if (Array.isArray(id)) {
			let ids = id.map(item => {
				let val = this.createIdQuery(item)
				if(val._id) {
					return val._id
				}
				return val
			})
			return { _id: { $in: ids } }
		}
		else {
			if(typeof id == 'object') {
				return id
			}
			let query;
			if(typeof id == 'string' && id.length == 24) {
				query = {
					_id: {
						id: Buffer.from(id, "hex"),
						_bsontype: "ObjectID",
					}
				}
				// query._id[Symbol.for('@@mdb.bson.version')] = 5
			}
			else {
				query = {
					_id: id
				}

			}
			
			return query
		}
	}

	/**
	 * Transforms the results of fetches. This is sometimes done when the object from the database should be augmented
	 * with additional information or should be converted into an object with a specific class. Override this function
	 * at need. By default it does essentially nothing.
	 * @param {object[]} result An array of objects from the database
	 * @param {string} collectionName The name of the collection these objects came from. If this class only queries a single
	 * collection, this parameter won't be of much use. If it queries multiple collection, this will help inform the method
	 * what to do with the object.
	 * @returns A promise which results in an array of objects.
	 */
	async postFetchesProcessor(result, collectionName) {
		return new Promise((resolve, reject) => {
			resolve(result)
		})
	}

	
	/**
	 * Fetches a list of documents from the collection.
	 * @param {Collection} collection A MongoDB Collection
	 * @param {object,array} query A mongodb query object. Can me null or {} if you want all documents. 
	 * @param {function} callback (optional) A callback if that's how you get down. This function would normally be used with promises and await.
	 * @returns A promise which resolves to an array of documents
	 */
	_fetchByQuery(collection, query = {}, callback) {
		let p = new Promise((resolve, reject) => {
			collection.find(query).toArray().then(result => {
				this.postFetchesProcessor(result, collection.collectionName).then((processed) => {
					resolve(processed)
				})
			}).catch(err => {
				this.log.error(err)
				return reject(err)
			})
		})
		return addCallbackToPromise(p, callback)
	}
	
	_removeByQuery(collection, query = {}, callback) {
		let p = new Promise((resolve, reject) => {
			collection.deleteMany(query).then(result => {
				this._notify(query, 'delete')
				resolve(result)
			}).catch(err => {
				this.log.error(err)
				return reject(err)
			})
		})
		return addCallbackToPromise(p, callback)
	}

	/**
	 * Fetches a list of documents from the collection.
	 * 
	 * @param {Collection} collection A MongoDB Collection
	 * @param {*} id A query. If it's an object, that's used directly. If it's a string, we'll try to turn it into a MongoDB style ID query object.
	 *  If an array is passed, each element is assumed to be an id of the objects to fetch.
	 * @param {function} callback (optional) A callback if that's how you get down. This function would normally be used with promises and await.
	 * @returns A promise which resolves to an array of documents containing either one of zero items
	 */
	_fetchById(collection, id, callback) {
		return this._fetchByQuery(collection, this.createIdQuery(id), callback)
	}

	/**
	 * Saves an object. If it already has an _id attribute, it replaces the existing document, otherwise inserts it.
	 * @param {Collection} collection A MongoDB Collection
	 * @param {object} focus The object to save
	 * @param {function} callback (optional) A callback if that's how you get down. This function would normally be used with promises and await.
	 * @returns Promise
	 */
	async _save(collection, focus, callback) {
		let p = new Promise((resolve, reject) => {
			if (focus._id) {
				let options = {
					upsert: true,
				}
				let id = focus._id
				collection.replaceOne({_id: id}, focus, options).then(result => {
					this._notify(focus, 'update')
					return resolve(result)
				}).catch(err => {
					this.log.error({
						error: err
					})
					return reject(err)
				})
			}
			else {
				collection.insertOne(focus).then(result => {
					this._notify(focus, 'create')
					return resolve(result)
				}).catch(err => {
					this.log.error({
						error: err
					})
					return reject(err)
				})
			}
		})
		return addCallbackToPromise(p, callback)
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
	async _saveMany(collection, foci, callback) {
		let promises = []
		for(let focus of foci) {
			promises.push(this._save(collection, focus))
		}	
		if(callback) {
			addCallbackToPromise(Promise.all(promises), callback)
		}	
		return promises
	}
	
	_notify(obj, type) {
		if(this.notification) {
			this.notification.emit('object-change', obj, type)
		}
	}
}

module.exports = DataService