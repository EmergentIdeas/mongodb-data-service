const AbstractDataService = require('@dankolz/abstract-data-service')

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
					return resolve([result.ops[0], 'update', result])
				}).catch(err => {
					this.log.error({
						error: err
					})
					return reject(err)
				})
			}
			else {
				collection.insertOne(focus).then(result => {
					return resolve([result.ops[0], 'create', result])
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

}

module.exports = MongoDataService