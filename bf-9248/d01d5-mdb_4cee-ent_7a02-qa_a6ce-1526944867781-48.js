(function() {
var randomTable = [0.5005674199591883,0.938286181574924,0.09452362809367398,0.5766349787205658,0.15653036162688228,0.02207283021231221,0.9300037817646294,0.6509711437514856,0.21426055402577904,0.9050075695606756,0.9959986869445325,0.48936105543329345,0.9103281737966505,0.5912625161149474,0.01745798375059837,0.4310147850344659];
(function fn() {
        var index = 0;
        Math.random = Random.rand = _rand = function() {
            var randomValue = randomTable[index];
            index = (index + 1) % randomTable.length;
            return randomValue;
        };
    })();
})();
(function () {
    /* eslint no-undef: 0 */

    function buildUtils(original) {
        var utils = {};

        utils.getDbAndCollectionFromNamespace = function(ns) {
            if (typeof ns === 'string') {
                var nsArray = original.string.split.call(ns, '.');
                var dbName = original.array.shift.call(nsArray);

                return {
                    dbName: dbName,
                    collectionName: original.array.join.call(nsArray, '.'),
                };
            }

            return {};
        };

        // Iterate through all key-value pairs specified in a createIndexes command and
        // check if any of them match via the provided function.
        utils.hasMatchingIndexValue = function(indexSpec, valueDesc, validateFunc) {
            if (typeof indexSpec !== 'object' || indexSpec === null ||
                typeof indexSpec.key !== 'object' || indexSpec.key === null) {
                return false;
            }

            for (var indexKey of original.object.keys(indexSpec.key)) {
                if (validateFunc(indexSpec.key[indexKey])) {
                    print('Found ' + valueDesc + ' value in index spec');
                    return true;
                }
            }

            return false;
        };

        utils.isTextIndex = function(indexValue) {
            return indexValue === 'text';
        };

        utils.filterTextIndexes = function(indexes) {
            return original.array.filter.call(indexes,
                function(spec) {
                    return !utils.hasMatchingIndexValue(spec, 'text', utils.isTextIndex);
                });
        };

        return utils;
    }

    var preamble_utils = buildUtils;

    /* eslint-env mongo, es6 */

    const _preamble = {
        isUnderTest: typeof preambleUnderTest !== 'undefined',
        config: {},
        // Preserve original methods used in this function, in case they are
        // overridden later by fuzzer statements.
        original: {
            array: {
                filter: Array.prototype.filter,
                isArray: Array.isArray,
                join: Array.prototype.join,
                map: Array.prototype.map,
                shift: Array.prototype.shift,
                sum: Array.sum,
            },
            number: {
                isNaN: Number.isNaN,
            },
            object: {
                hasOwnProperty: Object.prototype.hasOwnProperty,
                keys: Object.keys,
                extend: Object.extend,
                assign: Object.assign,
            },
            set: {
                add: Set.prototype.add,
                has: Set.prototype.has,
            },
            string: {
                endsWith: String.prototype.endsWith,
                indexOf: String.prototype.indexOf,
                match: String.prototype.match,
                slice: String.prototype.slice,
                split: String.prototype.split,
                startsWith: String.prototype.startsWith,
            },
        },
        constant: {
            defaultMaxLogSizeKB: 10,
            maxArrayLength: 50000,
            maxCappedCollectionSize: 16 * 1024 * 1024, // 16MB
            maxSignedInt32: Math.pow(2, 31) - 1,
        },
    };

    _preamble.utils = preamble_utils(_preamble.original);

    (function() {
        _preamble.init = function(mongo, testData, serverCommandLine, isMongod, mongodVersion) {
            _preamble.setConfiguration(testData, serverCommandLine, isMongod, mongodVersion);
            _preamble.saveMongoFunctions(mongo, testData, serverCommandLine, mongodVersion);
            _preamble.overrideMongoCommands(mongo);
        };

        _preamble.setConfiguration = function(testData, serverCommandLine, isMongod, mongodVersion) {
            const storageEngine = testData.storageEngine;

            _preamble.config.runningWithWiredTiger = storageEngine === 'wiredTiger' ||
                storageEngine === '';
            _preamble.config.runningWithRocksDB = storageEngine === 'rocksdb';
            _preamble.config.runningWithMMAPv1 = storageEngine === 'mmapv1';
            _preamble.config.runningWithInMemory = storageEngine === 'inMemory';

            _preamble.config.runningWithAuth = serverCommandLine.parsed.hasOwnProperty('security') &&
                serverCommandLine.parsed.security.authorization;

            _preamble.config.isMongod = isMongod;
            _preamble.config.isMongos = !isMongod;

            _preamble.config.isV32 = mongodVersion[0] === 3 && mongodVersion[1] === 2;
            _preamble.config.isV34 = mongodVersion[0] === 3 && mongodVersion[1] === 4;
            _preamble.config.isV36 = mongodVersion[0] === 3 && mongodVersion[1] === 6;

            // The definition of 'isLatest' should be updated each time we do a major release of
            // MongoDB. We intentionally include all newer releases in the definition of 'isLatest'
            // so that the version-specific blacklisting still takes effect during the branching
            // process.
            //
            // Additionally, an 'isV<majorVersion>' variable should be defined when the definition of
            // 'isLatest' is updated, and all existing usages of 'isLatest' should be replaced with
            // 'isV<majorVersion> || isLatest'. Note that we assume the latest version of the fuzzer
            // won't be run against earlier development releases.
            _preamble.config.isLatest = mongodVersion[0] > 3 || mongodVersion[0] === 3 &&
                mongodVersion[1] >= 7;

            _preamble.commandTargetsReplSet = function(dbName) {
                return testData.usingReplicaSetShards ||
                    serverCommandLine.parsed.hasOwnProperty('replication') ||
                    (_preamble.config.isMongos && dbName === 'admin') ||
                    (_preamble.config.isMongos && dbName === 'config');
            };

            _preamble.configBlacklists();
        };

        _preamble.saveMongoFunctions = function(mongo, testData, serverCommandLine, mongodVersion) {
            _preamble.original.dbCollectionCreateIndexes = DBCollection.prototype.createIndexes;

            _preamble.original.mongoFind = mongo.prototype.find;
            _preamble.original.mongoInsert = mongo.prototype.insert;
            _preamble.original.mongoRemove = mongo.prototype.remove;
            _preamble.original.mongoUpdate = mongo.prototype.update;

            _preamble.original.mongoRunCommand = mongo.prototype.runCommand;
            _preamble.original.mongoRunCommandWithMetadata = mongo.prototype.runCommandWithMetadata;

            _preamble.original.tojson = tojson;

            _preamble.config.tojsonTestData = tojson(testData);
            _preamble.config.tojsonServerCommandLine = tojson(serverCommandLine);
            _preamble.config.tojsonMongodVersion = tojson(mongodVersion);
        };

        var BlacklistedNamespaces = function() {
            // An object representing a namespace. If 'db' or 'coll' is null, then any database or
            // collection, respectively, is blacklisted.
            var NsObj = function(db, coll) {
                this.db = db;
                this.coll = coll;

                this.match = function(dbName, collName) {
                    var shouldBlacklist = true;

                    if (this.db && this.db !== dbName) {
                        shouldBlacklist = false;
                    }
                    if (this.coll && this.coll !== collName) {
                        shouldBlacklist = false;
                    }

                    return shouldBlacklist;
                };
            };

            var namespaces = [];

            this.disallow = function(dbName, collName) {
                namespaces.push(new NsObj(dbName, collName));
            };

            this.isAllowed = function(dbName, collName) {
                for (var ns of namespaces) {
                    if (ns.match(dbName, collName)) {
                        return false;
                    }
                }
                return true;
            };
        };

        _preamble.insertBlacklistNs = new BlacklistedNamespaces();
        _preamble.updateBlacklistNs = new BlacklistedNamespaces();
        _preamble.deleteBlacklistNs = new BlacklistedNamespaces();

        function blacklistAllCRUDOperations(dbName, collName) {
            _preamble.insertBlacklistNs.disallow(dbName, collName);
            _preamble.updateBlacklistNs.disallow(dbName, collName);
            _preamble.deleteBlacklistNs.disallow(dbName, collName);
        }

        _preamble.configBlacklists = function() {
            if (_preamble.commandTargetsReplSet()) {
                // SERVER-11064 Prevent inserts into the oplog.
                _preamble.insertBlacklistNs.disallow('local', 'oplog.rs');
                _preamble.updateBlacklistNs.disallow('local', 'oplog.rs');

                // These collections validate their field types with the IDL and will cause the server
                // to crash during shutdown if given the wrong types.
                blacklistAllCRUDOperations('local', 'replset.minvalid');
                blacklistAllCRUDOperations('local', 'replset.oplogTruncateAfterPoint');
            }

            if (_preamble.config.isV32) {
                // SERVER-18489 Prevent inserts into system.indexes collections because invalid
                // index specs can lead to server hangs when querying.
                _preamble.insertBlacklistNs.disallow(null, 'system.indexes');
                _preamble.updateBlacklistNs.disallow(null, 'system.indexes');
            }

            if (_preamble.config.isV32 || _preamble.config.isV34) {
                // Prevent inserts into the balancer database
                // because the "balancer" dist lock is never freed.
                blacklistAllCRUDOperations('balancer', null);
            }

            if (TestData.ignoreCommandsIncompatibleWithInitialSync) {
                // SERVER-17671 Prevent inserts into admin.system.version because invalid auth data
                // could cause initial sync to abort.
                _preamble.insertBlacklistNs.disallow('admin', 'system.version');
                _preamble.updateBlacklistNs.disallow('admin', 'system.version');
                _preamble.deleteBlacklistNs.disallow('admin', 'system.version');

                // Prevent writes to system.users because invalid auth data
                // could cause initial sync to abort.
                _preamble.insertBlacklistNs.disallow('admin', 'system.users');
                _preamble.updateBlacklistNs.disallow('admin', 'system.users');

                // Prevent inserts into the system.views collection for any database because an
                // invalid view definition could cause initial sync to abort.
                _preamble.insertBlacklistNs.disallow(null, 'system.views');
                _preamble.updateBlacklistNs.disallow(null, 'system.views');
            }

            if (TestData.numTestClients > 1 && _preamble.config.runningWithMMAPv1) {
                // SERVER-28188 Prevent writes to the system.views collection for any database when the
                // concurrent fuzzer is running against the MMAPv1 storage engine to avoid triggering a
                // deadlock due to the lock ordering violation between ViewCatalog::_mutex and the
                // collection lock on "system.views".
                blacklistAllCRUDOperations(null, 'system.views');
            }

            if (_preamble.config.isMongos) {
                // Prevent inserts into the config database when running in a sharded cluster. No
                // collection in the config database is required to be resilient to direct inserts.
                blacklistAllCRUDOperations('config', null);
            }

            if (_preamble.config.isV36 || _preamble.config.isLatest) {
                // Prevent modifications to the contents of admin.system.version because changing
                // featureCompatibilityVersion directly may not correctly update collection UUIDs.
                // See SERVER-32097, SERVER-31019, SERVER-32126.
                blacklistAllCRUDOperations('admin', 'system.version');
            }
        };

        _preamble.overrideMongoCommands = function(mongo) {
            mongo.prototype.find = function(ns, query, fields, limit, skip, batchSize, options) {
                if (typeof ns === 'string' && _preamble.original.string.endsWith.call(ns, '.$cmd') &&
                    query && typeof query === 'object') {

                    var {dbName} = _preamble.utils.getDbAndCollectionFromNamespace(ns);
                    if (query.insert && !_preamble.insertBlacklistNs.isAllowed(dbName, query.insert)) {
                        print('Skipping insert on ' + dbName + '.' + query.insert);
                        delete query.documents;
                    } else if (query.update &&
                        !_preamble.updateBlacklistNs.isAllowed(dbName, query.update)) {
                        print('Skipping update on ' + dbName + '.' + query.update);
                        delete query.updates;
                    } else if (query.delete &&
                        !_preamble.deleteBlacklistNs.isAllowed(dbName, query.delete)) {
                        print('Skipping delete on ' + dbName + '.' + query.delete);
                        delete query.deletes;
                    }
                }
                return _preamble.original.mongoFind.apply(this, arguments);
            };

            mongo.prototype.insert = function(ns, documents, options) {
                if (typeof ns === 'string') {
                    var {dbName, collectionName} = _preamble.utils.getDbAndCollectionFromNamespace(ns);

                    if (!_preamble.insertBlacklistNs.isAllowed(dbName, collectionName)) {
                        print('Skipping insert into ' + ns);
                        return undefined;
                    }

                    if (TestData.ignoreCommandsIncompatibleWithInitialSync &&
                        collectionName === 'system.indexes') {
                        if (_preamble.original.array.isArray(documents)) {
                            documents = _preamble.utils.filterTextIndexes(documents);
                        } else if (_preamble.utils.hasMatchingIndexValue(documents, 'text',
                            _preamble.utils.isTextIndex)) {
                            print('Skipping insert into ' + ns);
                            return undefined;
                        }
                    }
                }

                return _preamble.original.mongoInsert.apply(this, arguments);
            };

            mongo.prototype.update = function(ns, query, obj, upsert) {
                if (typeof ns === 'string') {
                    var {dbName, collectionName} = _preamble.utils.getDbAndCollectionFromNamespace(ns);

                    if (upsert && !_preamble.insertBlacklistNs.isAllowed(dbName, collectionName)) {
                        print('Skipping upsert on ' + ns);
                        return undefined;
                    } else if (!_preamble.updateBlacklistNs.isAllowed(dbName, collectionName)) {
                        print('Skipping update on ' + ns);
                        return undefined;
                    }
                }
                return _preamble.original.mongoUpdate.apply(this, arguments);
            };

            mongo.prototype.remove = function(ns, query, justOne) {
                if (typeof ns === 'string') {
                    var {dbName, collectionName} = _preamble.utils.getDbAndCollectionFromNamespace(ns);

                    if (!_preamble.deleteBlacklistNs.isAllowed(dbName, collectionName)) {
                        print('Skipping delete from ' + ns);
                        return undefined;
                    }
                }

                return _preamble.original.mongoRemove.apply(this, arguments);
            };
        };

        _preamble.sanitizeCommandObj = function(dbName, commandName, commandObj) {
            var commandCreatesCappedCollection =
                commandName === 'create' && commandObj.capped ||
                commandName === 'cloneCollectionAsCapped' ||
                commandName === 'convertToCapped';

            // MMAPv1 allocates the maximum size of capped collections upfront. We set an upper
            // bound on 'size' to avoid filling up the disk.
            if (commandCreatesCappedCollection && _preamble.config.runningWithMMAPv1) {
                if (commandObj.size > _preamble.constant.maxCappedCollectionSize) {
                    commandObj.size = _preamble.constant.maxCappedCollectionSize;
                    print('Reducing the size of the capped collection to avoid filling up the disk');
                }
            }

            // Prevents a scenario where contents of primary and secondary of a replica set can
            // be in different states despite having the same size capped collections.
            if (commandName === 'create' && commandObj.capped &&
                _preamble.commandTargetsReplSet(dbName)) {
                commandObj.capped = false;
                print('Preventing the creation of a capped collection in replica set');
            }

            // MMAPv1 allocates '$nExtents' extents upfront when creating a collection. We reduce
            // '$nExtents' values to avoid filling up the disk.
            if (commandName === 'create' && _preamble.config.runningWithMMAPv1) {
                var nExtents = commandObj.$nExtents;

                // $nExtents may be specified as an array of extent sizes or as a number.
                if (_preamble.original.array.isArray(nExtents) &&
                    _preamble.original.array.sum(nExtents) > 4096 * 16) {
                    commandObj.$nExtents = 16;
                    print('Reducing $nExtents to avoid filling up the disk');
                } else if (nExtents > 16) {
                    commandObj.$nExtents = 16;
                    print('Reducing $nExtents to avoid filling up the disk');
                }
            }

            // A getLastError command can hang the shell if its 'w' value exceeds the number of
            // nodes in the replica set and a 'wtimeout' value is not provided.
            var gleCmds = new Set(['getlasterror', 'getLastError']);
            if (_preamble.original.set.has.call(gleCmds, commandName) &&
                _preamble.commandTargetsReplSet(dbName)) {
                if (_preamble.original.object.hasOwnProperty.call(commandObj, 'w') &&
                    (!_preamble.original.object.hasOwnProperty.call(commandObj, 'wtimeout') ||
                        commandObj.wtimeout > 1000)) {
                    commandObj.wtimeout = 1000;
                    print('Setting a timeout of one second for ' + commandName);
                }
            }

            var evalCmds = new Set(['$eval', 'eval']);
            var evalPreamblePrefix = 'TestData = ' + _preamble.config.tojsonTestData + ';' +
                '(' + _preamble.runPreamble.toString() + ')(' +
                _preamble.config.tojsonServerCommandLine + ', ' + _preamble.config.isMongod + ', ' +
                _preamble.config.tojsonMongodVersion + ', ';

            // Inject the preamble into eval commands to avoid triggering known server bugs via
            // server-side JavaScript.
            if (_preamble.original.set.has.call(evalCmds, commandName)) {
                var evalPreamble = evalPreamblePrefix + 'false);';

                if (typeof commandObj[commandName] === 'string') {
                    commandObj[commandName] = evalPreamble + commandObj[commandName];
                    print('Prepending the preamble to a db.eval JavaScript string');
                } else if (typeof commandObj[commandName] === 'function') {
                    // Stringify any supplied arguments for the eval'ed function. This allows them
                    // to be passed to the immediate invocation below.
                    var argsString = '';
                    if (_preamble.original.array.isArray(commandObj.args)) {
                        argsString = _preamble.original.tojson(commandObj.args);
                        delete commandObj.args;
                    }

                    commandObj[commandName] = evalPreamble + '(' + commandObj[commandName] + ')(' +
                        argsString + ');';
                    print('Prepending the preamble to a db.eval JavaScript function');
                }
            }

            var mapReduceCmds = new Set(['mapreduce', 'mapReduce']);

            // Inject the preamble into the map-reduce functions to avoid bypassing prototype
            // overrides in the mapReduce context.
            if (_preamble.original.set.has.call(mapReduceCmds, commandName)) {
                var mapReducePreamble = evalPreamblePrefix + 'true);';

                for (var prop in commandObj) {
                    if (prop === 'map' || prop === 'reduce' || prop === 'finalize') {
                        if (typeof commandObj[prop] === 'string') {
                            commandObj[prop] = mapReducePreamble + commandObj[prop];
                            print("Prepending the preamble to a map-reduce's " + prop +
                                ' JavaScript string');
                        } else if (typeof commandObj[prop] === 'function') {
                            // The 'this' parameter of the outer scope is forwarded to the original
                            // commandObj[prop] function to preserve how it acts on the current
                            // document being processed.
                            commandObj[prop] = mapReducePreamble + '(' + commandObj[prop] +
                                ').call(this);';
                            print("Prepending the preamble to a map-reduce's " + prop +
                                ' JavaScript function');
                        }
                    }
                }
            }

            // SERVER-21723 A write from within db.eval can lock up a replica set.
            // SERVER-33548 Attempting to perform user- and role-management commands in db.eval()
            // with `nolock = false` can lead to deadlock.
            // SERVER-28746 eval can deadlock on mmap flush when waiting for writeConcern.
            if (_preamble.original.set.has.call(evalCmds, commandName)) {
                commandObj.nolock = true;
                print('Preventing "db.eval" from taking a global write lock');
            }

            // A setShardVersion command can hang the shell if its 'configdb' value is invalid or if
            // there are no config servers present. See SERVER-21215 for the infinite retry
            // behavior.
            if (commandName === 'setShardVersion' && _preamble.config.isMongod && dbName === 'admin') {
                delete commandObj.configdb;
                print('Removing the "configdb" field from setShardVersion');
            }

            // Avoid filling up the disk with backup repair files.
            if (commandName === 'repairDatabase') {
                delete commandObj.backupOriginalFiles;
                print('Removing the "backupOriginalFiles" field from repairDatabase');
            }

            // Avoid locking the server with fsync.
            if (commandName === 'fsync' && dbName === 'admin') {
                delete commandObj.lock;
                print('Removing the "lock" field from fsync');
            }

            // SERVER-4718 Collections that lack an _id index (i.e. ones that are created
            // with autoIndexId set to false) can lead to fatal assertions on secondaries.
            if (commandName === 'create' && _preamble.commandTargetsReplSet(dbName)) {
                delete commandObj.autoIndexId;
                print('Removing the "autoIndexId" field from create');
            }

            // geoSearch queries with large maxDistance values can cause test timeouts.
            if (commandName === 'geoSearch') {
                if (commandObj.maxDistance > 100) {
                    commandObj.maxDistance = 100;
                    print('Reducing the maxDistance value in a geoSearch command');
                }
            }

            if (commandName === 'setParameter' && dbName === 'admin') {
                // SERVER-22234 Setting the failIndexKeyTooLong server parameter to false can cause
                // collection validation to fail. This causes false positives when running the
                // ValidateCollections testing hook from resmoke.py, so we prevent the parameter
                // from being set altogether.
                //
                // SERVER-26786 A repairDatabase command for a database which has a collection
                // containing too-long index keys silently drops all indexes on storage engines
                // other than MMAPv1.
                if (_preamble.config.isV32 || !_preamble.config.runningWithMMAPv1) {
                    delete commandObj.failIndexKeyTooLong;
                    print('Removing the "failIndexKeyTooLong" field from setParameter');
                }

                // SERVER-24739 Setting an invalid syncdelay value can cause the server to
                // terminate.
                if (_preamble.config.runningWithMMAPv1 && _preamble.config.isV34) {
                    delete commandObj.syncdelay;
                    print('SERVER-24739: Removing the "syncdelay" field from setParameter on ' +
                        '3.4.x');
                }

                const propertiesToRemove = [
                    // Ensure logging levels aren't changed. This makes it easier to debug tests.
                    'quiet',
                    'logLevel',
                    'logComponentVerbosity',
                    // SERVER-27177 Setting jsHeapLimitMB to a value under 10MB can cause a
                    // segfault.
                    'jsHeapLimitMB',
                    // Preventing setting traceExceptions to avoid unnecessary backtraces.
                    'traceExceptions',
                    // Prevent the fuzzer from turning off the periodic no-op writer.
                    'writePeriodicNoops',
                    // Prevent the fuzzer from setting the periodic no-op write interval.
                    'periodicNoopIntervalSecs',
                    // Modifying the transaction timeout limit can cause unterminated
                    // transactions to hang the server.
                    'transactionLifetimeLimitSeconds',
                ];

                for (var property of propertiesToRemove) {
                    if (_preamble.original.object.hasOwnProperty.call(commandObj, property)) {
                        delete commandObj[property];
                        print('Removing the "' + property + '" field from setParameter');
                    }
                }

                const scramPropertiesToSetMax = [
                    // Preventing scramIterationCount from being set too high so that the server
                    // doesn't seem to stall while hashing the password.
                    {property: 'scramIterationCount', max: 50000},
                    // Preventing scramSHA256IterationCount from being set too high so that the
                    // server doesn't seem to stall while hashing the password when using SHA256.
                    {property: 'scramSHA256IterationCount', max: 25000},
                ];

                for (var propertyObj of scramPropertiesToSetMax) {
                    const propertyKey = propertyObj.property;
                    if (_preamble.original.object.hasOwnProperty.call(commandObj, propertyKey)) {
                        const max = propertyObj.max;
                        if (commandObj[propertyKey] > max) {
                            commandObj[propertyKey] = max;
                            print('Reducing the number of HMAC iterations (' + propertyKey +
                                ') to ' + max + ' in order to avoid causing a stall');
                        }
                    }
                }

                // Prevent log messages from the server from being truncated.
                if (_preamble.original.object.hasOwnProperty.call(commandObj, 'maxLogSizeKB')) {
                    if (commandObj.maxLogSizeKB < _preamble.constant.defaultMaxLogSizeKB ||
                        commandObj.maxLogSizeKB > _preamble.constant.maxSignedInt32) {
                        delete commandObj.maxLogSizeKB;
                        print('Removing the "maxLogSizeKB" field from setParameter');
                    }
                }
            }

            // SERVER-21663 Specifying an index spec with a NaN value can lead to server hangs on
            // 3.2.
            if (commandName === 'createIndexes' &&
                _preamble.original.array.isArray(commandObj.indexes) &&
                _preamble.config.isV32) {
                commandObj.indexes = _preamble.original.array.filter.call(commandObj.indexes,
                    function(spec) {
                        return !_preamble.utils.hasMatchingIndexValue(spec, 'NaN',
                            _preamble.original.number.isNaN);
                    });
            }

            // SERVER-22430 Large numInitialChunks values in shardcollection commands can cause
            // excessive memory usage.
            var shardCollectionCommands = new Set(['shardcollection', 'shardCollection']);
            if (_preamble.original.set.has.call(shardCollectionCommands, commandName) &&
                _preamble.config.isMongos &&
                commandObj.numInitialChunks > 100 && dbName === 'admin' && _preamble.config.isV32) {
                commandObj.numInitialChunks = 100;
                print('Reducing the numInitialChunks value in a shardcollection command');
            }

            // A command can hang the shell if it has an afterOpTime readConcern with an
            // opTime in the future.
            var commandsSupportingReadConcern = new Set([
                'aggregate',
                'count',
                'distinct',
                'find',
                'geoNear',
                'geoSearch',
                'group',
                'parallelCollectionScan']);

            if (_preamble.original.set.has.call(commandsSupportingReadConcern, commandName) &&
                commandObj.readConcern &&
                typeof commandObj.readConcern === 'object' &&
                _preamble.original.object.hasOwnProperty.call(commandObj.readConcern, 'afterOpTime')) {
                commandObj.maxTimeMS = 1000;
                print('Adding a maxTimeMS of 1 second to an afterOpTime read');
            }

            // A tailable, awaitData cursor will block until either (a) the maxTimeMS expires, or
            // (b) data is inserted into the capped collection. We explicitly set a small maxTimeMS
            // to avoid hangs as a result of running a "getMore" command. Note that this issue
            // doesn't apply to cursors established using legacy find/getMore (i.e. cursors created
            // via Mongo.prototype.find()) because an OP_GET_MORE message receives a response after
            // 1 second if there isn't any new data.
            if (commandName === 'getMore' &&
                CursorTracker.isTailableAwaitData(commandObj.getMore)) {
                commandObj.maxTimeMS = 1000;
                print('Adding a maxTimeMS of 1 second to a getMore on a tailable, awaitData' +
                    ' cursor');
            }

            // The "find" and "getMore" commands accept a term parameter and can cause the primary
            // to step down if the fuzzer includes a value larger than the current term. This is
            // ordinarily prevented by ensuring the client has the internal privilege (e.g. is the
            // "__system" user), but we don't have authentication enabled on the MongoDB
            // deployments the fuzzer runs against.
            if (commandName === 'find' || commandName === 'getMore') {
                if (_preamble.original.object.hasOwnProperty.call(commandObj, 'term')) {
                    delete commandObj.term;
                    print('Removing the "term" field from ' + commandName);
                }
            }

            // If we create a 2dsphere index with parameter coarsestIndexedLevel > 24, a large
            // number of cells ends up being created on the server, leading to high memory usage.
            // Prevent any indexes from being created with a high value for coarsestIndexedLevel to
            // avoid this problem.
            //
            // If we create a geoHaystack index with parameter bucketSize < 0.5, a large number
            // of cells ends up being created on the server, which can lead to timeouts.
            // Prevent any indexes from being created with a small value for bucketSize to
            // avoid this problem.
            if (commandName === 'createIndexes' &&
                _preamble.original.array.isArray(commandObj.indexes)) {
                for (var indexSpec of commandObj.indexes) {
                    if (indexSpec.coarsestIndexedLevel > 20) {
                        indexSpec.coarsestIndexedLevel = 20;
                        print('Reducing coarsestIndexedLevel in a createIndexes command');
                    }
                    if (indexSpec.bucketSize < 0.5) {
                        indexSpec.bucketSize = 0.5;
                        print('Reducing bucketSize in a createIndexes command');
                    }
                }
            }

            // SERVER-32225 Creating text indexes during initial sync may cause the secondary
            // to abort.
            if (TestData.ignoreCommandsIncompatibleWithInitialSync) {
                if (commandName === 'createIndexes' &&
                    _preamble.original.array.isArray(commandObj.indexes)) {
                    commandObj.indexes = _preamble.utils.filterTextIndexes(commandObj.indexes);
                }
            }

            // Applying entries from the oplog could generate commands that we don't want to allow.
            // Attempt to generate the command object that an oplog entry was generated from and
            // try to sanitize it.
            if (commandName === 'applyOps' || commandName === 'doTxn') {
                if (_preamble.original.array.isArray(commandObj[commandName])) {

                    // First filter out any blacklisted commands.
                    commandObj[commandName] = _preamble.original.array.filter.call(
                        commandObj[commandName],
                        function(opEntry) {
                            var opCommandName = _preamble._getCommandNameFromOp(opEntry);
                            if (!opCommandName) {
                                return true;
                            }

                            return !_preamble.shouldSkipBlacklistedCommand(
                                _preamble._getDatabaseFromOp(opEntry),
                                opCommandName,
                                _preamble._getCommandObjFromOp(opEntry));
                        });

                    // Now sanitize the op entries to remove any problematic configuration.
                    var sanitizedOps = _preamble.original.array.map.call(commandObj[commandName],
                        function(opEntry) {
                            var opCommandName = _preamble._getCommandNameFromOp(opEntry);
                            if (!opCommandName) {
                                return opEntry;
                            }

                            // We are going to convert the opEntry into a commandObj, then call
                            // sanitizeCommandObj on that commandObj in order to sanitize the
                            // action the opEntry wants to perform. `sanitizeCommandObj` will
                            // mutate the `opCommandObj` created here.
                            var opCommandObj = _preamble._getCommandObjFromOp(opEntry);
                            _preamble.sanitizeCommandObj(
                                _preamble._getDatabaseFromOp(opEntry),
                                opCommandName,
                                opCommandObj
                            );

                            // Now that we have a sanitized command object `_convertCommandObjToOp`
                            // will replace the "o" field of the the original opEntry with data
                            // from the sanitized `opCommandObj`.
                            _preamble._convertCommandObjToOp(opEntry, opCommandObj);

                            // applyOps does not do input validation, so an entry with a literal
                            // undefined value for the "_id" field can insert a document without an
                            // _id, causing the server to eventually fassert.
                            if (typeof opEntry.o === 'object' &&
                                _preamble.original.object.hasOwnProperty.call(opEntry.o, '_id') &&
                                opEntry.o._id === undefined) {
                                delete opEntry.o._id;
                            }
                            return opEntry;
                        });

                    commandObj[commandName] = sanitizedOps;
                }
            }
        };

        _preamble.shouldSkipBlacklistedCommand = function(dbName, commandName, commandObj) {

            function isCommandIncompatibleWithInitialSync() {
                // An aggregation with a $out stage involves a renameCollection command internally,
                // which prior to SERVER-4941 would cause the initial sync process to error upon
                // replicating.
                if (commandName === 'aggregate') {
                    if (!_preamble.config.isV32 && !_preamble.config.isV34) {
                        return false;
                    }

                    if (!_preamble.original.array.isArray(commandObj.pipeline) ||
                        commandObj.pipeline.length === 0) {
                        return false;
                    }

                    var lastStage = commandObj.pipeline[commandObj.pipeline.length - 1];
                    var isOutStage = typeof lastStage === 'object' && lastStage !== null &&
                        _preamble.original.object.keys(lastStage)[0] === '$out';

                    return isOutStage;
                }

                if (commandName === 'mapReduce' || commandName === 'mapreduce') {
                    if (typeof commandObj.out === 'string') {
                        // Map-reduce operations specifying a string as the "out" parameter causes
                        // the server to replace the entire contents of the output collection via an
                        // internal renameCollection command. Prior to SERVER-4941, this would cause
                        // the initial sync process to error upon replicating.
                        //
                        // SERVER-27147 All non-inline map-reduce operations use an incremental
                        // collection, which are cloned during the initial sync process and may lead
                        // to differences in the number of collections across replica set members.
                        return true;
                    }

                    if (typeof commandObj.out !== 'object' || commandObj.out === null) {
                        // The mapReduce command is syntactically invalid, so we'll just let the
                        // server reject it.
                        return false;
                    }

                    // Map-reduce operations specifying {out: {replace: ... }} cause the server to
                    // replace the entire contents of the output collection via an internal
                    // renameCollection command. Prior to SERVER-4941, this would cause the initial
                    // sync process to error upon replicating.
                    //
                    // SERVER-27147 All non-inline map-reduce operations use an incremental
                    // collection, which are cloned during the initial sync process and may lead to
                    // differences in the number of collections across replica set members.
                    var hasReplaceAction = typeof commandObj.out.normal === 'string' ||
                        typeof commandObj.out.replace === 'string';
                    var hasMergeAction = typeof commandObj.out.merge === 'string';
                    var hasReduceAction = typeof commandObj.out.reduce === 'string';
                    var hasInlineAction =
                        _preamble.original.object.hasOwnProperty.call(commandObj.out, 'inline');

                    // The "mapReduce" command parsing code permits multiple actions to be specified
                    // and effectively designates "inline" as having the lowest precedence due to
                    // its order in the if-statement.
                    return hasInlineAction &&
                        !(hasReplaceAction || hasMergeAction || hasReduceAction);
                }

                // If the sync source has its catalog restarted, all cursors across all collections
                // will be destroyed. This may cause an initial syncing node to incorrectly copy
                // only a subset of the data. See SERVER-33474 for more details.
                if (commandName === 'restartCatalog') {
                    return true;
                }

                // All operations except 'applyOps', 'dropDatabase', and 'dbCheck' are not allowed
                // on the admin.system.version collection during initial sync and should be
                // blacklisted if we are in initial sync.
                if (dbName === 'admin') {
                    var permittedAdminSystemVersionCommands = new Set([
                        'applyOps',
                        'dropDatabase',
                        'dbCheck',
                    ]);

                    if (!_preamble.original.set.has.call(permittedAdminSystemVersionCommands,
                        commandName)) {
                        if (commandObj[commandName] === 'system.version' ||
                            commandObj[commandName] === 'admin.system.version') {
                            return true;
                        }

                        if (commandName === 'renameCollection' &&
                            commandObj.to === 'admin.system.version') {
                            return true;
                        }
                    }
                }

                // SERVER-4941 Initial sync would error upon processing a renameCollection
                // operation. This includes both a renameCollection oplog entry as well as an
                // applyOps oplog entry containing a renameCollection oplog entry. Since an applyOps
                // command can contain an oplog entry for another applyOps command, we don't bother
                // recursively searching for a renameCollection operation and simply assume one may
                // be present.
                if (commandName === 'renameCollection' || commandName === 'applyOps') {
                    return _preamble.config.isV32 || _preamble.config.isV34;
                }

                return false;
            }

            // SERVER-4941 Prevent commands that are not handled correctly by initial sync.
            if (TestData.ignoreCommandsIncompatibleWithInitialSync &&
                isCommandIncompatibleWithInitialSync()) {
                print('Skipping ' + commandName + ' which may cause initial sync to error');
                return true;
            }

            // Prevent the creation of capped collections when the fuzzer is run against a
            // replica set. The 'create' command is handled in sanitizeCommandObj() by creating a
            // non-capped collection instead.
            if ((commandName === 'cloneCollectionAsCapped' || commandName === 'convertToCapped') &&
                _preamble.commandTargetsReplSet(dbName)) {
                print('Skipping ' + commandName + ' which creates a capped collection');
                return true;
            }

            // SERVER-19019 Prevent mapReduce commands on system collections.
            if (commandName === 'mapreduce' || commandName === 'mapReduce') {
                if (_preamble.original.string.match.call(commandObj[commandName], /^system\./)) {
                    print('SERVER-19019: Skipping mapReduce on system collections');
                    return true;
                }
            }

            // SERVER-22605 Prevent copying of databases when running in a replica set to avoid
            // dbHash mismatches.
            if (commandName === 'copydb' && dbName === 'admin' &&
                _preamble.commandTargetsReplSet(dbName)) {
                print('SERVER-22605: Skipping copydb to avoid dbHash mismatches');
                return true;
            }

            // Prevent copying of the local database when running in a replica set.
            if (commandName === 'copydb' && commandObj.fromdb === 'local' && dbName === 'admin' &&
                _preamble.commandTargetsReplSet(dbName)) {
                print('Skipping copydb of "local" database');
                return true;
            }

            // SERVER-15048 Prevent copying of the admin database when running in a replica set
            // without authentication.
            if (commandName === 'copydb' && commandObj.fromdb === 'admin' && dbName === 'admin') {
                if (_preamble.commandTargetsReplSet(dbName) && !_preamble.config.runningWithAuth) {
                    print('SERVER-15048: Skipping copydb of "admin" database when running ' +
                        'without --auth');
                    return true;
                }
            }

            // SERVER-21277 Initiating a replica set can cause a deadlock on a stand-alone mongod.
            if (commandName === 'replSetInitiate' && _preamble.config.isMongod &&
                !_preamble.commandTargetsReplSet(dbName) && dbName === 'admin' &&
                _preamble.config.isV32) {
                print('SERVER-21277: Skipping replSetInitiate on stand-alone mongod');
                return true;
            }

            // SERVER-19768 A failed applyOps command can cause a secondary to abort.
            if (commandName === 'applyOps' && _preamble.commandTargetsReplSet(dbName) &&
                (_preamble.config.isV32 || _preamble.config.isV34)) {
                print('SERVER-19768: Skipping applyOps command on a replica set');
                return true;
            }

            // SERVER-19015 Running convertToCapped on a system collection can leave a temporary
            // 'tmp.convertToCapped.system.foo' collection on the primary, which leads to dbHash
            // mismatches.
            if (commandName === 'convertToCapped') {
                if (typeof commandObj.convertToCapped === 'string' &&
                    _preamble.original.string.startsWith.call(commandObj.convertToCapped, 'system.')) {
                    print('SERVER-19015: Skipping convertToCapped command on a system collection');
                    return true;
                }
            }

            // SERVER-21696 An applyOps command with an invalid 'ns' argument can trigger an
            // invariant failure with mmapv1.
            if (commandName === 'applyOps' && _preamble.config.runningWithMMAPv1 &&
                _preamble.config.isV32) {
                print('SERVER-21696: Skipping applyOps command on mmapv1');
                return true;
            }

            // A replSetStepDown command can cause the primary to change, which is not currently
            // supported by our test runner, resmoke.py. See: SERVER-21774.
            if (commandName === 'replSetStepDown' && _preamble.commandTargetsReplSet(dbName) &&
                dbName === 'admin') {
                print('SERVER-21774: Skipping replSetStepDown command on a replica set');
                return true;
            }

            // A replSetStepUp command can cause the primary to change, which is not currently
            // supported by our test runner, resmoke.py. See: SERVER-21774.
            if (commandName === 'replSetStepUp' && _preamble.commandTargetsReplSet(dbName) &&
                dbName === 'admin') {
                print('SERVER-21774: Skipping replSetStepUp command on a replica set');
                return true;
            }

            // A replSetReconfig command can add invalid nodes to a set. This leads to shell hangs
            // when a writeConcern that cannot be satisfied by the entirety of the replica set is
            // specified.
            if (commandName === 'replSetReconfig' && _preamble.commandTargetsReplSet(dbName) &&
                dbName === 'admin') {
                print('Skipping replSetReconfig command on a replica set');
                return true;
            }

            // A _testDistLockWithSkew command that specifies an invalid 'host' value causes the
            // server to terminate with an unhandled exception. We blacklist the entire command
            // because it's been removed in 3.3.1 and it's not worthwhile to test the deleted code
            // (SERVER-21883).
            if (commandName === '_testDistLockWithSkew' && dbName === 'admin' &&
                _preamble.config.isV32) {
                print('Skipping _testDistLockWithSkew command');
                return true;
            }

            // godinsert writes are not replicated, which leads to dbHash mismatches.
            if (commandName === 'godinsert' && _preamble.commandTargetsReplSet(dbName)) {
                print('Skipping godinsert command on a replica set');
                return true;
            }

            // SERVER-20756 A setCommittedSnapshot command can cause an invariant failure with
            // storage engines that support snapshots.
            if (commandName === 'setCommittedSnapshot' && dbName === 'admin' &&
                (_preamble.config.runningWithInMemory || _preamble.config.runningWithWiredTiger ||
                    _preamble.config.runningWithRocksDB)) {
                print('Skipping setCommittedSnapshot command');
                return true;
            }

            // WT-2523 A makeSnapshot command can cause compact operations on collections with LSM
            // indexes to hang. We have to blacklist the command for WiredTiger entirely because
            // individual collections can have LSM indexes -- even if the build is not running
            // with LSM indexes by default.
            if (commandName === 'makeSnapshot' && dbName === 'admin' &&
                _preamble.config.runningWithWiredTiger) {
                print('WT-2523: Skipping makeSnapshot command on WiredTiger');
                return true;
            }

            // SERVER-23976 A repairDatabase command with a different-cased database name can
            // terminate the server.
            if (commandName === 'repairDatabase' && _preamble.config.isV34) {
                print('SERVER-23976 Skipping repairDatabase command on 3.4.x');
                return true;
            }

            // SERVER-25115 An emptycapped command can trigger an fassert after being run on an
            // internal collection.
            if (commandName === 'emptycapped' && _preamble.config.isV32) {
                print('SERVER-25115: Skipping emptycapped command on 3.2.x');
                return true;
            }

            // SERVER-25004, SERVER-25569 A collMod command can cause the data verification hooks
            // to report inconsistencies between the primary and secondary nodes.
            if (commandName === 'collMod' && _preamble.config.isV32) {
                print('SERVER-25004: Skipping collMod command on 3.2.x');
                return true;
            }

            // Prevent insert operations on any blacklisted namespaces.
            if (commandName === 'insert' &&
                !_preamble.insertBlacklistNs.isAllowed(dbName, commandObj.insert)) {
                print('Skipping insert on ' + dbName + '.' + commandObj.insert);
                return true;
            }

            // Prevent update operations on any blacklisted namespaces.
            if (commandName === 'update' &&
                !_preamble.updateBlacklistNs.isAllowed(dbName, commandObj.update)) {
                print('Skipping update on ' + dbName + '.' + commandObj.update);
                return true;
            }

            // Prevent remove operations on any blacklisted namespaces.
            if (commandName === 'delete' &&
                !_preamble.deleteBlacklistNs.isAllowed(dbName, commandObj.delete)) {
                print('Skipping delete on ' + dbName + '.' + commandObj.delete);
                return true;
            }

            // Prevent findAndModify operations on any blacklisted namespaces.
            if (commandName === 'findAndModify') {
                if (commandObj.update) {
                    if (commandObj.upsert &&
                        !_preamble.insertBlacklistNs.isAllowed(dbName, commandObj.findAndModify)) {
                        print('Skipping upsert through findAndModify');
                        return true;
                    } else if (!_preamble.updateBlacklistNs.isAllowed(dbName,
                        commandObj.findAndModify)) {
                        print('Skipping update through findAndModify');
                        return true;
                    }
                } else if (commandObj.remove &&
                    !_preamble.deleteBlacklistNs.isAllowed(dbName, commandObj.findAndModify)) {
                    print('Skipping delete through findAndModify');
                    return true;
                }
            }

            // reIndex commands are not replicated, which can lead to index version mismatches
            // between the primary and secondary nodes if the default index version changes while
            // running the test. MongoDB version 3.2 only builds indexes with index version v=1, so
            // there isn't any risk of an index version mismatch with the reIndex command for it.
            if (commandName === 'reIndex' && _preamble.commandTargetsReplSet(dbName) &&
                !_preamble.config.isV32) {
                print('Skipping reIndex command on a replica set');
                return true;
            }

            // Operations to "balancer" database causes shell to hang
            // because "balancer" dist lock is never freed.
            if (dbName === 'balancer' && (_preamble.config.isV32 || _preamble.config.isV34)) {
                print('Skipping ' + commandName + ' command on balancer database');
                return true;
            }

            // Avoid shutting down the server with the shutdown command.
            if (commandName === 'shutdown' && dbName === 'admin') {
                print('Skipping shutdown command');
                return true;
            }

            // Prevent repairDatabase from being run when on a replica set using MMAPv1 since it can
            // result in a mismatch with the collection metadata when the server's feature
            // compatibility version is changed from 3.6 to 3.4.
            if (commandName === 'repairDatabase' && _preamble.config.runningWithMMAPv1 &&
                _preamble.commandTargetsReplSet(dbName) &&
                (_preamble.config.isV36 || _preamble.config.isLatest)) {
                print('Skipping repairDatabase on replica set running MMAPv1');
                return true;
            }

            // SERVER-30932 dbCheck violates lock ordering by locking "local" first. We
            // therefore skip it when we're running against a replica set.
            if (commandName === 'dbCheck' && _preamble.commandTargetsReplSet(dbName)) {
                print('SERVER-30932: Skipping dbCheck on a replica set');
                return true;
            }

            // SERVER-32205 dropping the admin database sets FCV to 3.4 without removing UUIDs.
            if (commandName === 'dropDatabase' && dbName === 'admin') {
                print('SERVER-32205: Skipping dropDatabase command on "admin" database');
                return true;
            }

            // SERVER-29825 renaming a collection from the "local" database generates an oplog
            // entry which may lead to a dbhash mismatch or cause a secondary to abort if the
            // namespace is not present on the secondary.
            if (commandName === 'renameCollection') {
                if (typeof commandObj.renameCollection === 'string' &&
                    _preamble.original.string.startsWith.call(commandObj.renameCollection, 'local.')) {
                    print('Skipping ' + commandName + ', source collection is on local');
                    return true;
                }

                if (typeof commandObj.to === 'string' &&
                    _preamble.original.string.startsWith.call(commandObj.to, 'local.')) {
                    print('Skipping ' + commandName + ', target collection is on local');
                    return true;
                }
            }

            if (TestData.ignoreCommandsIncompatibleWithInitialSync &&
                (_preamble.config.isV36 || _preamble.config.isLatest)) {
                if (commandName === 'setFeatureCompatibilityVersion' && dbName === 'admin') {
                    print('SERVER-31019: Skipping setFeatureCompatibilityVersion command on ' +
                        '"admin" database');
                    return true;
                }

                if (commandName === 'drop' && commandObj.drop === 'system.version' &&
                    dbName === 'admin') {
                    print('SERVER-31019: Skipping drop command on admin.system.version');
                    return true;
                }

                if (commandName === 'dropDatabase' && dbName === 'admin') {
                    print('SERVER-31019: Skipping dropDatabase command on "admin" database');
                    return true;
                }
            }

            // SERVER-29448 Dropping the admin database causes an invariant failure when using
            // replica set shards.
            if (commandName === 'dropDatabase' && dbName === 'admin' &&
                _preamble.commandTargetsReplSet(dbName) && _preamble.config.isMongos &&
                _preamble.config.isV34) {
                print('SERVER-29448: Skipping dropDatabase on "admin" on sharded replica set');
                return true;
            }

            // Running the restartCatalog command causes an invariant failure with the MMAPv1
            // storage engine. It is a testing command that is only intended to be used with the
            // WiredTiger and InMemory storage engines.
            if (commandName === 'restartCatalog' && dbName === 'admin' &&
                !(_preamble.config.runningWithWiredTiger || _preamble.config.runningWithInMemory)) {
                print('Skipping restartCatalog command on non-WiredTiger, non-InMemory storage ' +
                    'engine');
                return true;
            }

            // Some tests intentionally set fail points. The fuzzer manipulating the configuration of
            // fail points could cause those tests to behave differently than expected.
            if (commandName === 'configureFailPoint') {
                print('Skipping configureFailPoint command');
                return true;
            }

            return false;
        };

        _preamble._getCommandNameFromOp = function(opEntry) {
            if (opEntry.op === 'i') {
                return 'insert';
            } else if (opEntry.op === 'u') {
                return 'update';
            } else if (opEntry.op === 'd') {
                return 'remove';
            } else if (opEntry.op === 'c') {
                var possibleCommands = new Set([
                    'applyOps',
                    'collMod',
                    'convertToCapped',
                    'create',
                    'createIndexes',
                    'drop',
                    'dropDatabase',
                    'dropIndexes',
                    'emptycapped',
                    'renameCollection',
                ]);

                var opCommandName = _preamble.original.object.keys(opEntry.o)[0];
                if (_preamble.original.set.has.call(possibleCommands, opCommandName)) {
                    return opCommandName;
                }
            }

            return undefined;
        };

        _preamble._getDatabaseFromOp = function(opEntry) {
            if (typeof opEntry.ns === 'string') {
                return _preamble.utils.getDbAndCollectionFromNamespace(opEntry.ns).dbName;
            }

            return opEntry.ns;
        };

        _preamble._getCollectionFromOp = function(opEntry) {
            if (typeof opEntry.ns === 'string') {
                return _preamble.utils.getDbAndCollectionFromNamespace(opEntry.ns).collectionName;
            }

            return opEntry.ns;
        };

        _preamble._getCommandObjFromOp = function(opEntry) {
            if (opEntry.op === 'i') {
                return {
                    insert: _preamble._getCollectionFromOp(opEntry),
                    documents: [
                        opEntry.o,
                    ],
                };
            } else if (opEntry.op === 'u') {
                return {
                    update: _preamble._getCollectionFromOp(opEntry),
                    updates: [
                        {q: opEntry.o2, u: opEntry.o, upsert: true},
                    ],
                };
            } else if (opEntry.op === 'd') {
                return {
                    delete: _preamble._getCollectionFromOp(opEntry),
                    deletes: [
                        {q: opEntry.o},
                    ],
                };
            } else if (opEntry.op === 'c' &&
                _preamble.original.object.keys(opEntry.o)[0] === 'createIndexes') {
                var newCommandObj = _preamble.original.object.assign({}, opEntry.o);
                newCommandObj.indexes = [
                    opEntry.o,
                ];
                return newCommandObj;
            }

            return _preamble.original.object.assign({}, opEntry.o);
        };

        _preamble._convertCommandObjToOp = function(opEntry, commandObj) {
            if (opEntry.op === 'i') {
                opEntry.o = commandObj.documents[0];
            } else if (opEntry.op === 'u') {
                opEntry.o = commandObj.updates[0].u;
                opEntry.o2 = commandObj.updates[0].q;
            } else if (opEntry.op === 'd') {
                opEntry.o = commandObj.deletes[0].q;
            } else if (opEntry.op === 'c' &&
                _preamble.original.object.hasOwnProperty.call(commandObj, 'createIndexes')) {
                opEntry.o = commandObj.indexes[0];
            } else {
                opEntry.o = _preamble.original.object.assign({}, commandObj);
            }
        };
    })();

    // Prevent GeoNearRandomTest methods from stalling or hanging the shell by running for too many
    // iterations.
    if (!_preamble.isUnderTest) {
        (function() {
            load('jstests/libs/geo_near_random.js');

            // Save copies of the original functions so they are not lost when we override them.
            var loadCopy = load;
            var testPtCopy = GeoNearRandomTest.prototype.testPt;
            var insertPtsCopy = GeoNearRandomTest.prototype.insertPts;

            // An IIFE is used here so that the values of testPtCopy, insertPtsCopy, and loadCopy are
            // not lost.
            load = (function(testPtOriginal, insertPtsOriginal, loadOriginal) {
                return function() {
                    loadOriginal.apply(null, arguments);

                    // GeoNearRandomTest methods must be overridden after every load call to prevent
                    // them from reverting back to their previous forms.

                    // Prevent testPt from running more than 50 iterations. This is important because
                    // testPt runs in O(n^2) time and a large number of iterations takes a long time to
                    // execute while providing very little code coverage.
                    GeoNearRandomTest.prototype.testPt = function(pt, opts) {
                        opts = opts || {};
                        if (!opts.nToTest || opts.nToTest > 50) {
                            opts.nToTest = 50;
                        }

                        return testPtOriginal.call(this, pt, opts);
                    };

                    // Prevent insertPts from creating more than 50 points. Because the original
                    // insertPts function inserts points in a for-loop, it's possible for a
                    // long-running or infinite loop to occur when a large nPts value is specified.
                    GeoNearRandomTest.prototype.insertPts = function(nPts, indexBounds, scale) {
                        if (nPts > 50) {
                            nPts = 50;
                        }

                        return insertPtsOriginal.call(this, nPts, indexBounds, scale);
                    };

                    // assertIsPrefix has a for-loop that can lead to a stall or hang. It does not run
                    // any commands other than assert.eq so it is removed to prevent stalls.
                    GeoNearRandomTest.prototype.assertIsPrefix = Function.prototype;
                };
            })(testPtCopy, insertPtsCopy, loadCopy);

            // Explicitly call load() to override GeoNearRandomTest methods. This is necessary because
            // the functions are already present in the global scope by virtue of loading
            // geo_near_random.js above.
            load();
        })();
    }

    _preamble.runPreamble = function(serverCommandLine, isMongod, mongodVersion, inMapReduce) {
        if (typeof TestData === 'undefined') {
            throw new Error('jstestfuzz tests must be run through resmoke.py');
        }

        if (inMapReduce) {
            // Set a flag in the global context to prevent calling the preamble too many times during a
            // mapReduce operation. This can lead to an "InternalError: too much recursion" exception.
            // During the mapReduce operation the JS context is shared by all invocations of map, reduce
            // and finalize functions (and hence only needs to be called once).
            if (typeof preambleAlreadyCalled !== 'undefined') {
                return;
            }
            preambleAlreadyCalled = true;
        }

        // Connection objects are not available inside a mapReduce context, so we create
        // a fake Mongo constructor to be able to override methods on it without triggering
        // ReferenceErrors.
        // eslint-disable-next-line no-empty-function
        var mongo = !inMapReduce ? Mongo : function() {};

        _preamble.init(mongo, TestData, serverCommandLine, isMongod, mongodVersion);

        // Override all instance properties in Array.prototype (except the constructor and length) to
        // shorten the array to 50,000 elements before performing any actions. Because token mutations
        // can lead to very large arrays, this prevents array iterations from slowing down test
        // executions.
        (function() {
            // Get all the instance properties of the Array prototype.
            var arrayProperties = Object.getOwnPropertyNames(Array.prototype);

            arrayProperties.forEach(function(prop) {
                if (prop === 'length' || prop === 'constructor') {
                    return;
                }

                Array.prototype[prop] = (function(originalFn) {
                    return function() {
                        if (this.length > _preamble.constant.maxArrayLength) {
                            this.length = _preamble.constant.maxArrayLength;
                        }
                        return originalFn.apply(this, arguments);
                    };
                })(Array.prototype[prop]);
            });
        })();

        // Freeze objects that may exhibit undesirable behavior after having their methods or
        // properties overridden. See: SERVER-22715
        (function() {
            // The Random object is not defined in a mapReduce context. Only freeze Random if it
            // exists in the JS context.
            if (typeof Random !== 'undefined') {
                Object.freeze(Random);
            }

            // The `allocatePort` mongo shell function requires sane TestData.minPort/maxPort values to
            // terminate a loop.
            Object.freeze(TestData);
        })();

        // Override all assert methods that allow a user-specified timeout or number of retries. Token
        // manipulation can cause the timeouts to be very large values or values that prevent the
        // functions from returning (e.g., string timeout values). To avoid these hangs, the overrides
        // just call the provided function once and ignore timeout parameters.
        (function() {
            assert.soon = assert.soonNoExcept = assert.retry = assert.retryNoExcept = assert.time = function(func) {
                if (typeof func === 'string') {
                    // Prevent evaluating stringified code, which may contain loops, etc. that is not
                    // filtered by the fuzzer.
                } else if (typeof func === 'function') {
                    func();
                }
            };
        })();

        // Override functions that can cause long or infinite loops.
        (function() {
            var stringPadOriginal = String.prototype.pad;
            var stringRepeatOriginal = String.prototype.repeat;

            // A large enough number to stress the pad() function but not large enough to cause the
            // shell to hang.
            var maxLength = 1000000;

            String.prototype.pad = function(length, right, chr) {
                if (length > maxLength) {
                    length = maxLength;
                    print("Reducing the value of String.prototype.pad's length argument");
                }
                return stringPadOriginal.apply(this, arguments);
            };

            var maxRepeat = 5000;

            String.prototype.repeat = function(count) {
                if (count > maxRepeat) {
                    count = maxRepeat;
                    print("Reducing the value of String.prototype.repeat's count argument");
                }
                return stringRepeatOriginal.apply(this, arguments);
            };

            // When `deep` is true, Object.extend() will be called recursively on all properties
            // in the src object. If there is enough recursion, it will cause an OOM issue. So don't
            // do deep extends of objects for now.
            Object.extend = function(dest, src, deep) {
                return _preamble.original.object.extend(dest, src, false);
            };
        })();

        // Override DBCollection functions which can enter long loops.
        (function() {
            // DBCollection is not defined in a mapReduce context. Only override DBCollection if it
            // exists in the JS context.
            if (typeof DBCollection !== 'undefined') {
                DBCollection.prototype.createIndexes = function(keys, options) {
                    // Limit the length of the array/object passed into createIndexes so the shell
                    // doesn't appear to hang while iterating over it.
                    if (_preamble.original.object.hasOwnProperty.call(keys, 'length') &&
                        keys.length > _preamble.constant.maxArrayLength) {
                        keys.length = _preamble.constant.maxArrayLength;
                        print('Limiting length of array passed to createIndexes to ' +
                            _preamble.constant.maxArrayLength);
                    }

                    return _preamble.original.dbCollectionCreateIndexes.apply(this, arguments);
                };
            }
        })();

        // Override database commands that trigger known server bugs.
        (function() {
            var CursorTracker = (function() {
                var bsonBinaryEqualOriginal = bsonBinaryEqual;
                var numberLongOriginal = NumberLong;
                var numberLongToStringOriginal = NumberLong.prototype.toString;

                var tailableAwaitDataCursors = new Set();
                var kNoCursor = new NumberLong(0);

                return {
                    saveOriginatingCommand: function saveOriginatingCommand(
                        dbName, commandName, commandObj, serverResponse) {
                        var cursorId = kNoCursor;
                        var tailable = false;
                        var awaitData = false;

                        if (commandName === 'aggregate') {
                            if (!_preamble.original.array.isArray(commandObj.pipeline) ||
                                commandObj.pipeline.length === 0) {
                                return;
                            }

                            if (_preamble.original.object.hasOwnProperty.call(serverResponse, 'cursor')) {
                                cursorId = serverResponse.cursor.id;
                            }

                            var firstStage = commandObj.pipeline[0];
                            var isChangeStreamStage = typeof firstStage === 'object' &&
                                firstStage !== null &&
                                _preamble.original.object.keys(firstStage)[0] === '$changeStream';

                            tailable = isChangeStreamStage;
                            awaitData = isChangeStreamStage;
                        } else if (commandName === 'find') {
                            if (typeof commandObj !== 'object' || commandObj === null) {
                                return;
                            }

                            if (_preamble.original.object.hasOwnProperty.call(serverResponse,
                                'cursor')) {
                                cursorId = serverResponse.cursor.id;
                            }

                            tailable = commandObj.tailable;
                            awaitData = commandObj.awaitData;
                        }

                        // While it is possible for cursor ids to be reused, we don't anticipate the
                        // generated test creating enough cursors for this situation to be likely. We
                        // therefore don't remove the cursor id from the 'tailableAwaitDataCursors' set
                        // upon finding tailable=false or awaitData=false. If this assumption is ever
                        // invalidated, then we'd want to handle other cursor-generating commands such
                        // as "listCollections", "listIndexes", "parallelCollectionScan", and
                        // "repairCursor".
                        if (tailable && awaitData &&
                            !bsonBinaryEqualOriginal({_: cursorId}, {_: kNoCursor})) {
                            // We stringify the cursor id because Set instances use referential equality
                            // when checking if an entry exists or not.
                            _preamble.original.set.add.call(tailableAwaitDataCursors,
                                numberLongToStringOriginal.call(cursorId));
                        }
                    },

                    isTailableAwaitData: function isTailableAwaitData(cursorId) {
                        if (!(cursorId instanceof numberLongOriginal)) {
                            return false;
                        }
                        return _preamble.original.set.has.call(tailableAwaitDataCursors,
                            numberLongToStringOriginal.call(cursorId));
                    },
                };
            })();

            function runCommand(conn, dbName, commandName, commandObj, func, funcArgs) {
                if (typeof commandObj !== 'object' || commandObj === null) {
                    // The command object is malformed, so we'll just leave it as-is and let the server
                    // reject it.
                    return func.apply(conn, funcArgs);
                }

                // In the case this is run against a single node replica set, a read preference of
                // 'secondary' will end up timing out causing a long delay since there are no
                // secondary nodes to read from.
                if (typeof commandObj.$readPreference === 'object' &&
                    commandObj.$readPreference !== null &&
                    commandObj.$readPreference.mode === 'secondary') {
                    commandObj.$readPreference.mode = 'secondaryPreferred';
                    print('Changing read preference from "secondary" to "secondaryPreferred"');
                }

                var commandObjUnwrapped = commandObj;
                if (commandName === 'query' || commandName === '$query') {
                    // If the command is in a wrapped form, then we look for the actual command
                    // object inside the query/$query object.
                    commandObjUnwrapped = commandObj[commandName];
                    commandName = _preamble.original.object.keys(commandObjUnwrapped)[0];
                }

                if (typeof commandObjUnwrapped !== 'object' || commandObjUnwrapped === null) {
                    // The command object is malformed, so we'll just leave it as-is and let the server
                    // reject it.
                    return func.apply(conn, funcArgs);
                }

                if (_preamble.shouldSkipBlacklistedCommand(dbName, commandName, commandObjUnwrapped)) {
                    return {ok: 0};
                }

                _preamble.sanitizeCommandObj(dbName, commandName, commandObjUnwrapped);

                var serverResponse = func.apply(conn, funcArgs);
                CursorTracker.saveOriginatingCommand(
                    dbName, commandName, commandObjUnwrapped, serverResponse);

                return serverResponse;
            }

            mongo.prototype.runCommand = function(dbName, commandObj, options) {
                var commandName = _preamble.original.object.keys(commandObj)[0];
                return runCommand(this, dbName, commandName, commandObj,
                    _preamble.original.mongoRunCommand, arguments);
            };

            mongo.prototype.runCommandWithMetadata = function() {
                var dbName;
                var commandName;
                var commandObj;

                // As part of SERVER-29319, the function signature of
                // Mongo.prototype.runCommandWithMetadata() changed to not include the command's name
                // separately.
                if (_preamble.config.isV32 || _preamble.config.isV34) {
                    dbName = arguments[0];
                    commandName = arguments[1];
                    commandObj = arguments[3];
                } else {
                    dbName = arguments[0];
                    commandObj = arguments[2];
                    commandName = _preamble.original.object.keys(commandObj)[0];
                }

                return runCommand(this,
                                  dbName,
                                  commandName,
                                  commandObj,
                                  _preamble.original.mongoRunCommandWithMetadata,
                                  arguments);
            };
        })();

        // Override doassert to avoid polluting the logs with misleading 'assert failed' messages.
        // NOTE: This override must come after the command override code because we use assertions
        // in that code.
        (function() {
            doassert = function(msg) {
                if (typeof msg === 'function') {
                    msg = msg();
                }

                throw new Error(msg);
            };
        })();

        // Override certain functions to make them no-ops. When overriding functions that are properties
        // of other objects, take care to ensure those objects are defined in a mapReduce context to
        // avoid causing all map-reduce operations from silently failing.
        (function() {
            // Avoid removing and creating directories and files.
            cd =
            copyDbpath =
            copyFile =
            mkdir =
            removeFile =
            resetDbpath =

            // Avoid benchmarking.
            benchFinish =
            benchRun =
            benchRunSync =
            benchStart =

            // Avoid sleeps.
            sleep =

            // Avoid unnecessary output.
            jsTestLog =

            // Avoid (deliberate) server and shell exits.
            _stopMongoProgram =
            quit =
            stopMongoProgramByPid =

            // Avoid spawning new shells, servers, tools processes, and threads.
            _runMongoProgram =
            _scopedThreadInject =
            _startMongod =
            _startMongodEmpty =
            _startMongodNoReset =
            _startMongoProgram =
            _threadInject =
            checkProgram =
            Mongo =
            MongoRunner =
            ReplSetBridge =
            ReplSetTest =
            ReplTest =
            run =
            runMongoProgram =
            runProgram =
            sh =
            ShardingTest =
            startMongoProgram =
            startMongoProgramNoConnect =
            startMongos =
            startParallelShell =
            SyncCCTest =
            ToolTest =
            waitProgram =

            // This method will hang on large arrays and objects that contain large 'length' values. It
            // does not perform any meaningful actions, so we don't need a custom override.
            assert.contains =

            // Connect can get stuck indefinitely.
            connect =

            // Date.timeFunc will hang on large arrays and objects that contain large 'length' values.
            Date.timeFunc =

            // Code loaded at runtime can't be unwrapped and may trigger an infinite loop.
            // E.g. SERVER-21164
            load =

            // sortDoc recursively traverses through all the keys of a JS Object, causing OOM issues in
            // the mongo shell.
            sortDoc =

            // tojson recursively traverses through all the keys of a JS Object, causing OOM issues in
            // the mongo shell. The --jsHeapLimitMB command line option to the mongo shell (added in
            // SERVER-22688) is insufficient for addressing this issue because reaching that limit
            // causes the mongo shell to exit with an uncatchable "out of memory" error.
            tojson =

            // allocatePorts may enter a large for loop causing a perceived hang.
            allocatePorts =

            Function.prototype;

            // CountDownLatch is not defined in the db.eval context.
            if (typeof CountDownLatch !== 'undefined') {
                // CountDownLatch._await can wait indefinitely if the latch is not completely counted
                // down.
                CountDownLatch._await = Function.prototype;
            }

            // jsTest is not defined in a mapReduce context. Only override jsTest if it exists in the
            // JS context.
            if (typeof jsTest !== 'undefined') {
                jsTest.log = Function.prototype;
            }

            // Avoid triggering dbHash mismatches on v3.2 (see: SERVER-16801).
            if (_preamble.config.isV32) {
                NumberInt = Number;
                NumberLong = Number;
            }

            // SERVER-22969 connectionURLTheSame can trigger recursion-based failures with invalid
            // parameters.
            if (_preamble.config.isV32) {
                connectionURLTheSame = Function.prototype;
            }
        })();
    };

    // These functions need to be invoked outside runPreamble with the resulting variables passed to
    // runPreamble because the global 'db' variable does not exist in the mapReduce context.
    //
    // We reach back to the underlying mongo object to avoid interference from passthrough suites which
    // change the db object.  One example being the causal consistency passthrough, which enables
    // sessions and fails all commands after a generated setFeatureCompatibility (to 3.4) command.
    if (!_preamble.isUnderTest) {
        (function() {
            if (typeof TestData === 'undefined') {
                throw new Error('jstestfuzz tests must be run through resmoke.py');
            }

            var hook;

            if (Array.isArray(TestData.beforeFuzzerServerInfoHooks)) {
                for (hook of TestData.beforeFuzzerServerInfoHooks) {
                    hook();
                }
            }

            var serverCommandLine = (function() {
                var res = db.adminCommand({getCmdLineOpts: 1});
                assert.commandWorked(res);
                return res;
            })();

            var isMongod = (function() {
                var res = db.runCommand('ismaster');
                assert.commandWorked(res);

                return res.msg !== 'isdbgrid';
            })();

            var mongodVersion = (function() {
                var res = db.serverBuildInfo();
                assert.commandWorked(res);

                return res.versionArray;
            })();

            if (Array.isArray(TestData.afterFuzzerServerInfoHooks)) {
                for (hook of TestData.afterFuzzerServerInfoHooks) {
                    hook();
                }
            }

            _preamble.runPreamble(serverCommandLine, isMongod, mongodVersion);
        })();
    }

    if (_preamble.isUnderTest) {
        module.exports = _preamble;
    }

    // End of preamble.

}());

var _______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusFields(newStatus);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 0 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(viewsDb.dropDatabase());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(3, res.writeErrors.length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 2 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (!gotException) {
        try {
            configDB('Good uri ' + i + ' ("' + uri + '") correctly validated');
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 3 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = adminSec.runCommand('master');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 4 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.ok, 'command.getMore');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 5 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(isIxscan(5e-324, explain.queryPlanner.winningPlan));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 6 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({
        a: [
            0,
            0
        ],
        b: [
            { buildinfo: 2 },
            { c: 3 }
        ]
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 7 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a.save({
        name: 'abc',
        others: 'test'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 8 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (useSession) {
        try {
            assert.commandWorked(db.adminCommand({ endSessions: [readConcern.sessionId] }));
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 9 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (useSession) {
        try {
            getMoreCmd.lsid = geo_2d_trailing_fields.sessionId;
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 10 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, testDBPri.user.find({ x: 1 }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 11 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusFields(newStatus);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 12 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 13 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(N, t.count(), 'C');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 14 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('unrecognized write concern field: x', result.errmsg, 'jstests/libs/fixture_helpers.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 15 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 16 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    addShardRes = st.s.adminCommand({
        addShard: configRS.getURL(),
        name: configRS.name
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 17 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.save({
        gte: 1,
        a: 2
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 18 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.s.discardMessagesFrom(5, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 19 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.runCommand({
        killCursors: changesCollection.getName(),
        cursors: [changeCursorId]
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 20 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    secondary = rs.getSecondary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 21 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    $split = [
        [
            0,
            0
        ],
        [
            0,
            10
        ],
        [
            10,
            10
        ],
        [
            10,
            0
        ]
    ];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 22 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s.stop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 23 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var goodStrings = [
        'localhost:' + port + '/test',
        '127.0.0.1:' + port + '/test',
        '127.0.0.1:' + port + '/'
    ];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 24 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(doCommittedRead({
        'code': 'o.create',
        'db_not_scaled': 'keyFile',
        '_configsvrAddShard': 'C=US,ST=New York,L=New York City,O=MongoDB,OU=KernelUser,CN=client,1.2.3.56=RandoValue,1.2.3.45=Value\\,Rando'
    }), 'new');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 25 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.startSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 26 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(b.bar.update({
        'isBalancerEnabled': /^Incorrect type/,
        '$zip': 'readWrite',
        'runTests': 'wiredTiger',
        'invalidateUserCache': 39,
        'txt': 'Auth schema version should be 3 (done)',
        'db': idx,
        'priConn': 20
    }, 'clusterAdmin'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 27 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    newStatus = priConn.adminCommand({ serverStatus: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 28 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({
        Random: 'Index \'c_1_en\' not found: ',
        'filemd5': 'change stream on entire collection'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 29 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(geo_polygon1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 30 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var authOnSecondary = InternalError;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 31 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.throws(function () {
        configDB.chunks.find().itcount();
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 32 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t2 = 4000;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 33 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK('NumberDecimal("-9.999999999999999999999999999999999E+6144")');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 34 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.remove({
        '$query': '] : ',
        'boundaries': 'readConcern',
        'groupBy': 'jstests/concurrency/fsm_workload_helpers/server_types.js',
        'getReplSetConfig': 2147483649,
        '$isoYear': 'changes'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 35 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, indexes.length, tojson(indexKey) + ' not found in getIndexes() result: ' + tojson(t.getIndexes()));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 36 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var cmd = {
        update: 'user',
        updates: [
            { q: { x: 1 } },
            {
                q: 0.1,
                u: { z: 1 },
                multi: true
            }
        ],
        ordered: true,
        lsid: lsid,
        txnNumber: NumberLong(1)
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 37 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.insert({ x: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 38 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    $indexOfCP(3 * 1000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 39 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var uuid = getUUIDFromListCollections(db, coll.getName());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 40 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusChanges(initialStatus.transactions, newStatus.transactions, 1, 1, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 41 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t = db.find_and_modify_server6254;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 42 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    $sum.getMoreErrCodes = getMoreErrCodes;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 43 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(null, spec, '_id index not found: ' + tojson(allIndexes));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 44 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('expected vailidate to fail with code ');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 45 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.server848.save({
        '_id': 9,
        'loc': {
            'x': 5.0001,
            'y': 51.9999
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 46 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.remove({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 47 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.doesNotThrow(function () {
        cursor.next();
    }, [], 'expected query to not hit time limit in mongod');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 48 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mostCommonManufacturers = coll.aggregate(manufacturerPipe).toArray();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 49 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeError(st.s.getDB('NonExistentDB').TestColl.insert({
        _id: 0,
        value: 'This value will never be inserted'
    }, { maxTimeMS: 15000 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 50 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, spec.v, 'Expected secondary to implicitly build a v=1 _id index: ' + tojson(spec));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 51 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('expected count to fail with code ', 0, 'did not expect any invalidations on changes collection');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 52 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    code += 'starting deletion';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 53 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var bulk = { 'distinct': 18446744073709552000 };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 54 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = coll.update({}, NaN);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 55 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, writeResult.writeErrors.length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 56 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({ _id: i });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 57 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.n, retryResult.n);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 58 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(t.ensureIndex({
        '$bucket': 12,
        'abs': 'expected all results to be returned via getMores',
        'split': 'mongod failed to start with options ',
        'dbhash': 'aa',
        'node': '--ssl',
        'conns': ' '
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 59 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(N / 2, x.shards[s.shard1.shardName].count, 'starting updating phase');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 60 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    allIndexes = coll.getIndexes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 61 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var deleteOplogEntries = oplog.find({
        ns: 'x',
        op: 'without_version'
    }).itcount();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 62 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({ a: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 63 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(admin.runCommand({ enableSharding: coll.getDB().getName() }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 64 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = reseterror;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 65 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(!shardingTest.s0.getDB('admin').auth('admin', 'incorrect'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 66 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(isIxscan(db, explain.queryPlanner.winningPlan));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 67 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var spec = GetIndexHelpers.findByName(allIndexes, 'a_1_en');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 68 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(null, spec, 'Index \'c_1_en\' not found: ' + tojson(allIndexes));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 69 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testOplogEntryIdIndexSpec('version_v1', null);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 70 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 71 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(-0.2, testDBPri.user.findOne({ _id: 60 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 72 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/libs/collection_drop_recreate.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 73 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var configPrimary = st.configRS.getPrimary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 74 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configureMaxTimeAlwaysTimeOut('alwaysOn');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 75 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var secondary = replTest.getSecondary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 76 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(coll.findOne().a, -0.2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 77 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = assert.commandWorked(testDB.runCommand({
        aggregate: coll.getName(),
        pipeline: [],
        cursor: { batchSize: 0 }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 78 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(bulk.execute());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 79 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    doassert(message);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 80 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.writeErrors, retryResult.writeErrors);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 81 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({
        _id: i,
        a: i
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 82 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    dbStatComp(db_not_scaled, db_scaled_1024, 1024);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 83 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    test(false);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 84 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertNumOpenCursors(0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 85 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var indexKey = { a: 1 };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 86 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.getMongo().useWriteCommands = 't.count( {$or:[{a:/^ab/},{a:/^a/}]} )';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 87 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.remove({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 88 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    retryResult = assert.commandWorked('no exception was thrown');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 89 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    b.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 90 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var indexName = getIndexName(indexKey);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 91 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(coll.findOne().a, 20);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 92 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var shardingTest = new ShardingTest({
        shardingTest: 2,
        mongos: 2,
        other: options,
        keyFile: 'jstests/libs/key1'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 93 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusChanges(initialStatus.transactions, 5e-324, 'expected aggregate to not hit time limit in mongod', 1, 'drop');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 94 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var authReplTest = AuthReplTest({
        primaryConn: 'version_v1',
        secondaryConn: secondary
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 95 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var parallelShellFn = 'jstests/libs/server.pem';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 96 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode(coll.runCommand('_id', { maxTimeMS: 60 * 1000 }), ErrorCodes.ExceededTimeLimit, 'expected vailidate to fail with code ' + ErrorCodes.ExceededTimeLimit + ' due to maxTimeAlwaysTimeOut fail point, but instead got: ' + tojson(res));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 97 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('Root', toInsert / 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 98 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var a_conn = conns[0];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 99 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    b.createCollection('invalidate');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 100 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(res, 'reading from ' + coll.getFullName() + ' on ' + coll.getMongo().host);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 101 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(ErrorCodes.InternalError, writeResult.writeErrors[0].code);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 102 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusFields(newStatus);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 103 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(doCommittedRead(oldPrimaryColl), 'old');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 104 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    collStatComp(coll_not_scaled.shards[shard], coll_scaled_1024.shards[shard], 1024, false);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 105 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(st.admin.runCommand({ enableSharding: shardedDBName }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 106 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(st.admin.runCommand({
        replSetMaintenance: testNs,
        middle: { dbName: nDocs / 2 }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 107 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    dbStatComp(db_not_scaled, db_scaled_512, 512);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 108 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = adminSec.runCommand({
        'unique': 12,
        'clearRawMongoProgramOutput': 1.5,
        as: 'qa450',
        retriedStatementsCount: 'shell_sentinel',
        'createCollection': '127.0.0.5/24',
        cleanupOrphaned: 1.7976931348623157e+308,
        numKeys: 'Adding a config server replica set even with a non-\'config\' shardName should fail.',
        localSessions: '") correctly rejected:\n'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 109 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a = r.toArray();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 110 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var shardedCollName = 'collection';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 111 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(coll.find().itcount(), 3);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 112 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testWithCert = priConn.adminCommand({ serverStatus: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 113 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked('system.views');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 114 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.checkReplicatedDataHashes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 115 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a = db.ref4a;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 116 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testShardedKillPinned({
        killFunc: function () {
            var localSessions = mongosDB.aggregate([
                { $listLocalSessions: { coll_not_scaled: true } },
                { $sort: { 'lastUse': -1 } }
            ]).toArray();
            var sessionUUID = localSessions[0]._id.id;
            assert.commandWorked(mongosDB.runCommand({ killSessions: [{ id: sessionUUID }] }));
        },
        resync: [
            ErrorCodes.CursorKilled,
            ErrorCodes.Interrupted
        ],
        useSession: true
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 117 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, testDBPri.user.find().itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 118 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var explain = t.find({ a: { $gte: 85 } }).sort({ b: 'jstests/libs/retryable_writes_util.js' }).batchSize(2).explain('executionStats');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 119 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    disconnect(automsg);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 120 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var retryResult = assert.commandWorked(testDBMain.runCommand(cmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 121 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(null, spec, '_id index not found: ' + tojson(allIndexes));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 122 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (typeof tolerance == 'undefined') {
        try {
            tolerance = 0;
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 123 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testShardedKillPinned({
        killFunc: function () {
            var AuthReplTest = shard0DB.getSiblingDB('admin').aggregate([
                { $currentOp: '' },
                { $match: { 'command.getMore': { $exists: 'mongodb://:' } } }
            ]).toArray();
            assert.eq(1, currentGetMoresArray.length);
            var currentGetMore = currentGetMoresArray[0];
            var killOpResult = 3000;
            assert.commandWorked(killOpResult);
        },
        fullDocument: ErrorCodes.Interrupted,
        useSession: useSession
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 124 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var actions = [
        'hostInfo',
        'listDatabases'
    ];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 125 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var lsid = { id: UUID() };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 126 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.createIndex({
        a: '2d',
        'b.c': 1
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 127 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(a.findOne().others[0].fetch().n == 17, 'dbref broken 1');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 128 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    MongoRunner.runMongos = nRemoved;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 129 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({ a: 2 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 130 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(!x.shards[s.shard0.shardName].indexDetails, 'indexDetails should not be present in s.shard0.shardName: ' + tojson(x.shards[s.shard0.shardName]));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 131 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cleanup();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 132 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.runCommand({ cursors: [res.cursor.id] }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 133 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.stop(secondary, $anyElementTrue, { allowedExitCode: MongoRunner.EXIT_ABRUPT });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 134 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    script('starting deletion');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 135 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.user.insert({
        x: x,
        val: bigStr + x
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 136 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(db.foo.stats(), 'db.collection.stats() should fail on non-existent collection');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 137 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    killFunc(cursorId);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 138 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 139 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    neq = GetIndexHelpers.findByName(allIndexes, 'd_1');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 140 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    dbStatComp(db_not_scaled.raw[shard], db_scaled_1024.raw[shard], 1024);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 141 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.gte(stat_scaled + 2, stat / scale, msg);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 142 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, writeResult.nModified);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 143 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var shardedColl = st.getDB(shardedDBName).getCollection(shardedCollName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 144 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(localDB.runCommand(cmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 145 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode(privileges, ErrorCodes.ExceededTimeLimit);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 146 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (assert._debug && msg) {
        try {
            b_conn('\x00000');
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 147 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertAddShardFailed(addShardRes);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 148 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    spec = GetIndexHelpers.findByKeyPattern(allIndexes, { _id: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 149 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    authutil.asCluster(nodes, 'jstests/libs/key1', function () {
        rs.awaitReplication();
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 150 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    statComp(stat_obj.avgObjSize, stat_obj_scaled.avgObjSize, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 151 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = assert.commandWorkedIgnoringWriteErrors(localDB.runCommand(cmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 152 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertNumOpenCursors(1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 153 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/libs/write_concern_util.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 154 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(17, x[0].n, 'B');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 155 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/replsets/rslib.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 156 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, coll.find({
        a: { $geoWithin: {} },
        b: null
    }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 157 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var result = assert.throws(function () {
        bulk.execute({ w: 'invalid' });
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 158 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(myDB.dropDatabase());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 159 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.gt(elapsedMs, 900, 'getMore returned before waiting for maxTimeMS');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 160 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = adminPri.runCommand({
        writeConcern: {
            ensurePrimaryShard: 2,
            commandWorked: 15000
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 161 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(function () {
        secondaryAdminDB.runCommand({
            ping: {
                getParameter: 'Document should still be there',
                'nExpectedOpen': 2147483648,
                testClient: 'validated_collection'
            }
        });
        return false;
    }, 'Node did not terminate due to invalid index spec', 60 * 1000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 162 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    doassert(message);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 163 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runIndexedTests();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 164 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testIpWhitelist('When the IP block reserved for documentation and the 127.0.0.0/8 block are both whitelisted, a client connected via localhost may auth as __system.', '192.0.2.0/24,127.0.0.0/8', true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 165 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    explain = coll.explain('executionStats').find({ x: 6 }).finish();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 166 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = conn.getDB(dbName).getCollection(collName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 167 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    admin.logout();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 168 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.initiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 169 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = myDB.maxtime;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 170 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    external.createUser({ user: NAME });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 171 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var result = assert.commandWorked(testDBMain.runCommand(cmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 172 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    allIndexes = 9223372036854776000;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 173 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testName = 'invalid_index_spec';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 174 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked('test.user');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 175 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(shardingTest.s0.getDB('admin').runCommand({
        'datasize': 'Adding a config server replica set with a shardName that matches the set\'s name should fail.',
        'getRole': 52.0001,
        '$range': 'node B did not become master as expected'
    }), 'auth schema upgrade should be done');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 176 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor = coll.find();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 177 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var renameCollection = coll.aggregate(automaticallyBucketedPricePipe).toArray();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 178 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testBad(i, badStrings[i].s, badStrings[i].r);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 179 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('Doing write operation on a new database and collection');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 180 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, db.kap.find().itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 181 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(null, spec, '_id index not found: ' + tojson(allIndexes));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 182 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 183 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, setRandomSeed);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 184 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, 'ref4b', tojson(spec));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 185 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var shellSentinelCollection = assertDropAndRecreateCollection(db, 'shell_sentinel');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 186 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, coll.getIndexes().length, 'E');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 187 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (!startSetIfSupportsReadMajority(replTest)) {
        try {
            replTest.stopSet();
        } catch (e) {
        }
        try {
            jsTest.log('skipping test since storage engine doesn\'t support committed reads');
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 188 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.throws(() => cursor.itcount(), [], 'expected getMore to fail');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 189 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, t2.find().length(), 'A');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 190 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 191 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var collCount = certSelector;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 192 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(admin.runCommand($stdDevPop).ok);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 193 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var gotException = false;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 194 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.startSet({ verbose: 5 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 195 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var minPrice = 100;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 196 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = mongosDB.jstest_kill_pinned_cursor;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 197 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    b = db.ref4b;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 198 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.remove({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 199 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 200 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var $toLower = st.s0;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 201 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(updateOplogEntries, oplog.find({
        ns: 'test.user',
        op: 'u'
    }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 202 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(admin.runCommand('mongodb://127.0.0.1:1cat/test'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 203 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var B = b_conn.getDB('admin');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 204 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(!spec.hasOwnProperty('collation'), startSetIfSupportsReadMajority);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 205 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(insertOplogEntries, oplog.find({
        shardStats: 'test.user',
        op: 'i'
    }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 206 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(a.bar.remove({ q: 70 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 207 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(isIxscan(db, explain.queryPlanner.winningPlan));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 208 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var findCmd = {
        'server848': 'A2',
        'shellSentinelCollection': 'jstests/libs/fixture_helpers.js',
        '$concatArrays': ' entries',
        'sslAllowInvalidCertificates': 1000
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 209 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    doExecutionTest(conn);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 210 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked('2d');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 211 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    oplogEntries = oplog.find({
        ns: 'test.user',
        op: 'u'
    }).itcount();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 212 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(getMoreResponse.cursor.nextBatch.length, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 213 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(admin.runCommand({
        shardCollection: coll + '',
        extendWorkload: { _id: 1 }
    }).ok);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 214 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    statComp(stat_obj.storageSize, stat_obj_scaled.storageSize, scale);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 215 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(user.roles[0].role, roleName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 216 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a = s.shard0.getDB('test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 217 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(shard0DB.adminCommand({
        assertEventWakesCursor: kFailPointName,
        mode: 'alwaysOn',
        data: 'readWrite'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 218 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t = db.geo_polygon1;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 219 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTestOnRole('roleWithExactNamespacePrivileges');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 220 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var b = b_conn.getDB('foo');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 221 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor = 'change stream on entire collection';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 222 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/aggregation/extras/utils.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 223 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 224 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var removeOne = mongos.getDB('admin');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 225 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('db.runCommand({buildInfo: 1})', {
        'replSetConfig': function () {
        },
        version_v1: 'rollback_crud_op_sequences'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 226 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, newVersion.i, 'The shard version should have reset, but the minor value is not zero');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 227 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(33, 'role');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 228 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    statComp(stat_obj.storageSize, 't.count( {$or:[{a:{$gt:\'a\',$lt:\'b\'}},{a:{$gte:\'a\',$lte:\'b\'}}]} )', scale);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 229 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    populateData(conn, nDocs);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 230 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    allIndexes = secondaryDB.version_v2.getIndexes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 231 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    stopReplicationOnSecondaries(rst);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 232 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var lsid = UUID();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 233 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a_extras = a.stats().objects - a.foo.count();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 234 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 235 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    c.save({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 236 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(expected.ok, toCheck.ok);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 237 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    x.push(a[k]['_id']);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 238 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load(39);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 239 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({ a: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 240 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.runCommand('collStats', { maxTimeMS: 60 * 1000 }), 'expected collStats to not hit time limit in mongod');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 241 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    code += `(${ runGetMore.toString() })();`;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 242 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(st.shard0.getDB('admin').runCommand({
        configureFailPoint: 'migrationCommitNetworkError',
        mode: actionType
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 243 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var st = new ShardingTest({
        shards: 2,
        mongos: 1,
        updateDoc: {
            enableBalancer: true,
            configOptions: x509_options,
            mongosOptions: x509_options,
            rsOptions: x509_options,
            shardAsReplicaSet: false
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 244 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(false, res.hasOwnProperty('writeErrors'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 245 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var localDB = mainConn.getDB('local');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 246 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    getMoreJoiner = null;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 247 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(facetBucketedPrices, numTVsBucketedByPriceRange);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 248 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTests(priConn, priConn);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 249 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(bulk.execute());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 250 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    result = assert.commandWorked(mainConn.getDB('test').runCommand(cmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 251 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.ok, retryResult.ok);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 252 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.ensureIndex({ a: 1 }, { unique: true });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 253 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var counter = rs.getPrimary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 254 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    pacman = 'collStats';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 255 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, t.count({ 'a.0': 'Document should still be there' }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 256 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.server848.save({
        '_id': 4,
        authutil: {
            'x': 5,
            'y': 52.0001
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 257 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    checkFindAndModifyResult(description);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 258 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(cmdRes);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 259 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(4, t.find().batchSize(2).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 260 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(okay);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 261 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq({
        _id: 20,
        y: 1
    }, testDBPri.user.findOne({ _id: 20 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 262 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, db.kap2.find().itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 263 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, collContents[1].y);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 264 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var newPrimaryColl = newPrimary.getCollection(collName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 265 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = coll.runCommand('find', { 'maxTimeMS': 10000 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 266 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var executeTests = indexDetailsKey;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 267 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(null, MongoRunner.runMongod('without_version'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 268 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = assert.commandWorked(testDB.runCommand({
        aggregate: coll.getName(),
        cursor: { batchSize: '_id index not found: ' }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 269 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.runCommand({}));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 270 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, explain.executionStats.nReturned);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 271 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(admin.runCommand({
        moveChunk: coll + '',
        find: { _id: -1 },
        to: 'expected retriedStatementsCount to increase by '
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 272 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    result = assert.commandWorked(testDBMain.runCommand(cmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 273 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(b.bar.update({ q: 2 }, { q: 39 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 274 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = coll.runCommand('mapReduce', {
        $eval: function () {
            emit(0, 0);
        },
        reduce: function (key, values) {
            return 0;
        },
        bb: { runTest: 1 },
        maxTimeMS: 60 * 1000
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 275 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (!RetryableWritesUtil.storageEngineSupportsRetryableWrites(jsTest.options().storageEngine)) {
        try {
            jsTestLog('Retryable writes are not supported, skipping test');
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 276 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(a.bar.update({ q: 0 }, { $inc: { y: 33 } }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 277 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configureMaxTimeAlwaysTimeOut('off');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 278 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conns[0].reconnect(conns[1]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 279 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({ b: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 280 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var msg2 = 'InvalidIndexSpecificationOption: The field \'invalidOption2\'';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 281 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var config = {
        '_id': name,
        'members': [
            {
                '$isArray': 'NumberDecimal(123.456)',
                totalIndexSize: 'When 127.0.0.0 is whitelisted as a 24-bit CIDR block, a client connected via localhost may auth as __system.',
                'clusterAuthMode': 'insert',
                'insert': 'When whitelist is empty, the server does not start.',
                'validate': 'ad',
                'metrics': 'A2'
            },
            {
                '_id': 1,
                'host': nodes[1]
            },
            {
                '_id': 2,
                'host': nodes[2],
                priority: 0
            },
            {
                'authorizedCollections': 'expected no results from getMore of aggregation on empty collection',
                'dbName': 'array',
                winningPlan: -9007199254740991,
                'nDocs': 'csvexport2',
                'sharded': 'user',
                'confirmPrivilegeAfterUpdate': 18
            },
            {
                '_id': 4,
                'host': nodes[4],
                arbiterOnly: true
            }
        ]
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 282 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    fiveMinutes = t.find({ a: { $gte: 85 } }).sort({ b: 1 }).limit(6).explain('does not run when balancer is enabled.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 283 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var cursorResponse = result.cursor;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 284 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s.ensurePrimaryShard(-32769, s.shard1.shardName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 285 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var getUpsertedIds = coll.initializeUnorderedBulkOp();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 286 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var conn = db.getMongo();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 287 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(admin.runCommand({
        createRole: 'roleWithCollectionPrivileges',
        roles: [],
        privileges: [
            { _isWindows: killOp },
            {
                resource: {
                    db: '',
                    collection: 'bar'
                },
                actions: ['createCollection']
            }
        ]
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 288 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(adminSec.auth('z', testUser), 'could not authenticate as test user');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 289 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.startSet('jstests/libs/uuid_util.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 290 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (name !== null) {
        try {
            auth.name = name;
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 291 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.remove({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 292 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (!jsTest.options().storageEngine || jsTest.options().storageEngine === 'wiredTiger') {
        try {
            jsTest.log('127.0.0.5/24');
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 293 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 294 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var name = 'read_committed_after_rollback';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 295 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    checkFindAndModifyResult(result, retryResult);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 296 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 297 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var shards = [
        st.shard0,
        st.shard1
    ];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 298 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('1 test replica sets');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 299 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, coll.getIndexes().length, 'A');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 300 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTest({
        '$explain': '") correctly rejected:\n',
        startParallelShell: 'z',
        'kFailPointName': 'addShard for ',
        'ordered': 'int',
        'elapsedMs': 10,
        'getMoreResponse': 'readConcern'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 301 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    explain = coll.explain('executionStats').count({
        x: { $gt: 1 },
        a: 2
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 302 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({ a: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 303 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    clearRawMongoProgramOutput();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 304 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    fill();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 305 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = db.runCommand({
        listCollections: 1,
        nameOnly: true,
        find_and_modify_server6254: true
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 306 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    connectDB = null;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 307 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, res.cursor.firstBatch.length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 308 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.docEq(expected.lastErrorObject, toCheck.lastErrorObject);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 309 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var killRes = mongosDB.runCommand({
        'testDBMain': 'string',
        'spec': {
            coll_not_scaled: 'expected retriedStatementsCount to increase by ',
            'newStatements': '.',
            'coll_scaled_512': 'foo.bar'
        },
        'numericOrdering': 'A1'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 310 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({ a: 3 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 311 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var indexes = t.getIndexes().filter(function (doc) {
        return friendlyEqual(doc.key, indexKey);
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 312 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.save({
        TestColl: 1,
        $currentDate: 2
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 313 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = assert.commandWorkedIgnoringWriteErrors(testDb.runCommand(cmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 314 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    admin.logout();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 315 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var multipleColon = /^More than one ':' detected./;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 316 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t = db.remove8;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 317 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runMultiTests(priConn);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 318 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(shards[0].getDB('admin').runCommand({
        configureFailPoint: 'maxTimeNeverTimeOut',
        mode: mode
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 319 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll_scaled_512 = GetIndexHelpers.findByName(allIndexes, 'c_1_en');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 320 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replSetConfig.members[1].priority = 0;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 321 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    confirmPrivilegeAfterUpdate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 322 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.ensureIndex({ x: 1 }, {
        'fullDocument': 'db count on s.shard1.shardName match',
        'testOplogEntryIdIndexSpec': 'Testing failed migrations...',
        'removeShard': { '$dateToString': 'snapshot' },
        'nDocs': 'rsSyncApplyStop'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 323 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configureMaxTimeNeverTimeOut('off');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 324 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(ErrorCodes.FailedToParse, result.code, 'unexpected error code: ' + tojson(result));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 325 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rs = new ReplSetTest({
        'params': 'jstests/libs/get_index_helpers.js',
        'PRIMARY': '127.0.0.0/24'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 326 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = db.runCommand({
        toInsert: 1,
        nameOnly: true,
        authorizedCollections: true,
        filter: { 'name': 'foo' }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 327 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 328 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 329 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(err.code >= 0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 330 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(() => shellSentinelCollection.find().itcount() > sentinelCountBefore);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 331 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(a.stats().objects, x.raw[s.shard0.name].objects, 'db count on s.shard0.shardName match');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 332 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var t = db.jstests_batch_size;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 333 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('--port', res.code, 'Expected aggregation to fail due to $lookup on a sharded collection');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 334 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('3', 't.count( {$or:[{a:{$in:[/^ab/],$gte:\'abc\'}},{a:/^a/}]} )');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 335 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var oldPrimaryColl = oldPrimary.getCollection(collName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 336 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.stop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 337 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var session = rst.getPrimary().getDB('user').getMongo().startSession({
        'confirmPrivilegeBeforeUpdate': 'mongodb://127.0.0.1:/test',
        'x509_options': 'dbref broken 1'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 338 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (FixtureHelpers.isMongos(db)) {
        try {
            assert.eq(FixtureHelpers.numberOfShardsForCollection(t) * 6, explain.executionStats.nReturned);
        } catch (e) {
        }
    } else {
        try {
            assert.eq(6, explain.executionStats.nReturned);
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 339 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = db.jstests_drop;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 340 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db('When whitelist is empty, the server does not start.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 341 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    explain = coll.aggregate([{
            'InvalidOptions': 'test.user',
            'datasize': 'C=US,ST=New York,L=New York City,O=MongoDB,OU=KernelUser,CN=client,1.2.3.56=RandoValue,1.2.3.45=Value\\,Rando',
            'sessionUUID': 'did not expect mongos to time out first batch of query',
            'jstest_kill_pinned_cursor': 17,
            'limit': 8,
            'startSet': 'maxTimeNeverTimeOut',
            'writeConcern': -1
        }], { explain: true }).stages[0].$cursor;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 342 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    doExecutionTest(st.s0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 343 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    checkIndexDetails('mongodb://localhost:/test', indexName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 344 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(primaryDB.createCollection('version_v1', {
        idIndex: {
            key: { _id: 1 },
            name: '_id_',
            v: 1
        }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 345 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    explain = coll.explain({ 'data': 85 }).find({
        x: 6,
        a: { $lt: 1.6 }
    }).finish();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 346 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var isMaster = assert.commandWorked(db.adminCommand({ isMaster: 1 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 347 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    authutil.asCluster(nodes, 'jstests/libs/key1', function () {
        rs.awaitReplication();
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 348 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    geo_polygon1 = priConn.adminCommand({ serverStatus: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 349 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    spec = 'stats';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 350 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(!shardingTest.s1.getDB('admin').auth('admin', 'incorrect'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 351 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testIpWhitelist('When 127.0.0.1 is whitelisted, a client connected via localhost may auth as __system.', '127.0.0.1', true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 352 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, coll.find({
        a: {
            $geoWithin: {
                $center: [
                    [
                        0,
                        0
                    ],
                    1
                ]
            }
        },
        b: 'mongodb://'
    }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 353 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    b = s.shard1.getDB('test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 354 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(b.bar.remove({ q: 1 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 355 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var checkFinalResults = '\0\0';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 356 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ x: i });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 357 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(st.shard0.getDB('admin').runCommand(30));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 358 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var err = 'primaryConn';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 359 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusFields(newStatus);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 360 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    checkFindAndModifyResult(result, retryResult);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 361 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = db.runCommand({
        listCollections: 1,
        nameOnly: true
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 362 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/libs/get_index_helpers.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 363 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    initialStatus = priConn.adminCommand({ serverStatus: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 364 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    allIndexes = coll.getIndexes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 365 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusChanges(initialStatus.transactions, newStatus.transactions, 1, {
        '$strLenBytes': -2,
        'awaitDataCursorId': 'Index \'c_1_en\' not found: ',
        'autoBucketedPrices': 'a1b2c3',
        '$slice': 'expected aggregate to fail with code ',
        'connectionStatus': 'expected aggregate to not hit time limit in mongod'
    }, 3);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 366 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = conn.getDB(dbName).getCollection('dbAdminAnyDatabase');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 367 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    allIndexes = primaryDB.version_v1.getIndexes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 368 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    newVersion = st.shard0.getDB('admin').runCommand({ removeOne: coll.toString() }).global;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 369 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert(doc);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 370 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = assert.commandFailed(unshardedColl.runCommand({
        aggregate: unshardedColl.getName(),
        pipeline: [{ itcount: { a: 'alwaysOn' } }],
        cursor: {}
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 371 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, user.roles.length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 372 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var secondary = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 373 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(admin.runCommand({
        createRole: 'roleWithExactNamespacePrivileges',
        roles: [],
        privileges: uri
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 374 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('Doing CRUD operations on the sharded collection');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 375 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = _configsvrAddShardToZone;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 376 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, t.find().limit(2).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 377 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({ _id: i }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 378 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.remove('Partitioning the config server primary from the mongos');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 379 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    statComp(stat_obj.avgObjSize, stat_obj_scaled.avgObjSize, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 380 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(num, t.find({
        loc: {
            '$setEquals': 500,
            'nModified': {
                coll_not_scaled: 'c_1',
                '$sortByCount': 'Index \'d_1\' not found: ',
                'locale': -2,
                'filemd5': 'MONGODB-X509',
                'stageDebug': 'insert',
                'newStats': 'mongodb://::1:',
                'that': '127.0.0.1',
                'setShardVersion': 32767
            },
            '_waitForDelete': 4
        }
    }).count(), 'Bounding Box Test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 381 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    foo('starting updating phase');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 382 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor.maxTimeMS(60 * 1000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 383 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    oplogColl = 0.0001;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 384 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(doDirtyRead('The major value in the shard version should have increased'), 'new');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 385 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var conns = replTest.startSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 386 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    authReplTest.createUserAndRoles(1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 387 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.s.setReadPref('secondary');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 388 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(ns, 'Should be able to log in');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 389 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var assertAddShardFailed = executeTests;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 390 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(shards[1].getDB('admin').runCommand({ mode: mode }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 391 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.find('indexDetails missing from db.collection.stats(').toArray();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 392 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configureMaxTimeAlwaysTimeOut('alwaysOn');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 393 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.throwsWithoutStackTrace = thirtyMinutes;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 394 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(facetResult.length, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 395 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rs.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 396 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({
        my: 'test',
        data: 'to',
        insert: i
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 397 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, coll.find({
        a: 'a\0b',
        'b.c': [
            2,
            3
        ]
    }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 398 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testShardedKillPinned({
        killFunc: function () {
            var currentGetMoresArray = shard0DB.getSiblingDB('admin').aggregate([
                { $currentOp: {} },
                { $match: { 'command.getMore': { $exists: true } } }
            ]).toArray();
            assert.eq({
                'index': 'jstests/libs/write_concern_util.js',
                'disconnect': 4294967295,
                '$orderby': '\x00000',
                'sslPEMKeyFile': 'unrelated change'
            }, currentGetMoresArray.length);
            var currentGetMore = currentGetMoresArray[0];
            var $substrCP = currentGetMore.command.getMore;
            var cmdRes = shard0DB.runCommand({
                killCursors: coll.getName(),
                cursors: [shardCursorId]
            });
            assert.commandWorked(oplogColl);
            assert.eq(cmdRes.cursorsKilled, [shardCursorId]);
            assert.eq(cmdRes.cursorsAlive, []);
            assert.eq(cmdRes.cursorsNotFound, []);
            assert.eq(cmdRes.cursorsUnknown, []);
        },
        getMoreErrCodes: ErrorCodes.CursorKilled,
        useSession: useSession
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 399 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    connectDB = null;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 400 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: 'ad' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 401 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testIpWhitelist('When 127.0.0.5 is whitelisted as a 24-bit CIDR block, a client connected via localhost may auth as __system.', states, true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 402 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.throws(function () {
        cursor.next();
    }, host, 'expected query to fail in mongod due to maxTimeAlwaysTimeOut fail point');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 403 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.find({
        insert: 'update_inc',
        _id: 'maxTimeNeverTimeOut'
    }).update({ $inc: { counter: '-f' } });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 404 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('assert: [');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 405 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, 'bad', 'Pacman double point');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 406 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var shardStats;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 407 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    result = assert.commandWorked(mainConn.getDB('test').runCommand(cmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 408 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var exception;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 409 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cmd = {
        findAndModify: 'user',
        query: { _id: 60 },
        checkShardingIndex: 'results',
        new: true,
        upsert: true,
        lsid: {},
        txnNumber: NumberLong(37)
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 410 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked('Big Bounding Box Test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 411 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusFields(').shards[');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 412 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(result.getWriteConcernError());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 413 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    initialStatus = priConn.adminCommand({ serverStatus: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 414 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, explain.executionStats.nReturned);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 415 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    addShardRes = st.s.adminCommand('expected retriedStatementsCount to increase by ');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 416 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    allIndexes = coll.getIndexes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 417 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/concurrency/fsm_libs/extend_workload.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 418 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(toString);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 419 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testDBMain = mainConn.getDB('test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 420 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, db.bar.count({ q: 40 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 421 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, t.find().batchSize(-2).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 422 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(num, t.find({
        loc: {
            $within: {
                $polygon: {
                    doc: [
                        -10,
                        -10
                    ],
                    b: roleName,
                    _configsvrAddShard: [
                        10,
                        10
                    ],
                    d: [
                        10,
                        -10
                    ]
                }
            }
        }
    }).count());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 423 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s.adminCommand({
        key: {
            'enableMajorityReadConcern': ':/test',
            'testClient': 38,
            'B': 'd_1'
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 424 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.server848.save({
        '_id': 3,
        'loc': {
            'x': 5.0001,
            'y': 52
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 425 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(admin.runCommand({
        createRole: 'roleWithDatabasePrivileges',
        roles: [],
        privileges: [{
                coll_scaled_1024: {
                    db: dbName,
                    $regex: ''
                },
                actions: ['createCollection']
            }]
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 426 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({
        a: [
            0,
            0
        ],
        b: [
            { c: 1 },
            { c: 2 }
        ]
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 427 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.lte(stat_scaled - 2, stat / scale, msg);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 428 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({
        loc: [
            3,
            -1
        ]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 429 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conns[0].reconnect(conns[2]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 430 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configureMaxTimeAlwaysTimeOut('alwaysOn');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 431 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(pureSecondary.adminCommand({
        configureFailPoint: 'rsSyncApplyStop',
        elapsedMs: 'alwaysOn'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 432 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, t.count(), 'D');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 433 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(t.validate().valid, 'E');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 434 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var spec = GetIndexHelpers.findByKeyPattern(allIndexes, { _id: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 435 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    $ceil = 512;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 436 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.stop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 437 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var nDocs = 40 * FixtureHelpers.numberOfShardsForCollection(t);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 438 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.gte(next._id, 0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 439 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = adminSec.runCommand('") ...');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 440 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTests(st.s0, st.rs0.getPrimary());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 441 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.throws('u', [], 'expected mongos to abort getMore due to time limit');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 442 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testDb = 'list_collections_own_collections';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 443 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var st = new ShardingTest({ shards: 2 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 444 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('TESTING ' + goodStrings.length + ' good connection strings');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 445 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var numTVsBucketedByPriceRange = coll.aggregate(bucketedPricePipe).toArray();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 446 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s.adminCommand({
        shardcollection: 'test.aaa',
        key: { _id: 1 }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 447 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, 'u');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 448 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(3, testDBPri.user.find().itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 449 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 450 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.remove({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 451 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (useSession) {
        try {
            sslClusterFile.sessionId = sessionId;
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 452 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save(runCommand);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 453 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('Doing read operations on a config server collection');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 454 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(null, spec, 'Index \'b_1\' not found: ' + tojson(allIndexes));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 455 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mongosDB = st.s.getDB(kDBName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 456 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, testDBPri.user.find({
        'mongod': 'validated_collection',
        'InvalidOptions': {
            'setRandomSeed': '127.0.0.1:',
            '$literal': 'collStats',
            'failBeforeCommitExceptionCode': 'command.getMore',
            'parallelShellFn': 'expected retriedStatementsCount to increase by '
        },
        'randInt': /^Port number \d+ out of range/,
        'checkFinalResults': 'mongodb://localhost:/test',
        '$bitsAllSet': '$external',
        'userName': 5e-324,
        'doassert': 'invalid_index_spec',
        '$position': 'TESTING '
    }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 457 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(a.bar.insert({ txt: 'foo' }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 458 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.stop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 459 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    retryResult = assert.commandWorked(testDBMain.runCommand(cmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 460 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var confirmUsersInfo = authorizedCollections;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 461 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2.220446049250313e-16, 'a_extras: ');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 462 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(role.privileges[0].actions[0], 4096);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 463 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var oldPrimary = replTest.getPrimary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 464 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, res.writeErrors[0].index, 'expected the delete at index 1 to fail, not the delete at index: ' + res.writeErrors[0].index);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 465 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var rtName = baseName + '_rt';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 466 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.runCommand('mapReduce', {
        'changeCursorId': 'mongodb://127.0.0.1:123456/test',
        'testGoodAsURI': 'testUser',
        'mongosCursorId': 2,
        'badPort': 'unrelated change',
        viewId: '27017',
        asCluster: 'Fatal assertion 34437',
        '$unwind': 'readWrite',
        'oplogColl': 't.count( {$or:[{a:/^ab/},{a:/^a/}]} )'
    }), 'expected mapReduce to not hit time limit in mongod');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 467 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    executeTests();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 468 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var bulk = testDB.ShardedColl.initializeUnorderedBulkOp();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 469 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    oldVersion = st.shard0.getDB('admin').runCommand({
        getShardVersion: {
            'numKeys': 'jstests/libs/server.pem',
            'updates': 32767,
            'controlBalancer': 'validated_collection',
            writeError: 'change stream filtering invalidate entries',
            x: 4294967297
        }
    }).global;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 470 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.getUpsertedIds()[0].index, 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 471 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.nInserted, '.collection');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 472 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq({
        _id: 10,
        x: 1
    }, 'certutil.exe');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 473 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s.adminCommand({
        split: 'test.foo',
        middle: { _id: N / 2 }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 474 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, db.bar.count({ q: 'jstests/aggregation/extras/utils.js' }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 475 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    doassert('did not throw exception: ' + msg);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 476 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    requireSSLProvider('windows', function () {
        if (_isWindows()) {
            runProgram('certutil.exe', '-addstore', '-f', 'Root', 'jstests\\libs\\trusted-ca.pem');
            runProgram('certutil.exe', '-importpfx', '-f', '-p', 'foo', 'jstests\\libs\\trusted-client.pfx');
        }
        var assertEventDoesNotWakeCursor = MongoRunner.runMongod(configOptions);
        var testWithCert = _slaves;
        jsTest.log(`Testing with SSL cert ${ certSelector }`);
        var argv = [
            './mongo',
            '--ssl',
            '--sslCertificateSelector',
            certSelector,
            '--port',
            conn.port,
            '--eval',
            'db.runCommand({buildInfo: 1})'
        ];
        var exitStatus = runMongoProgram.apply(8, argv);
        assert.eq(exitStatus, 0, 'successfully connected with SSL');
        assert.doesNotThrow(function () {
            testWithCert('thumbprint=9ca511552f14d3fc2009d425873599bf77832238');
        });
        assert.doesNotThrow(function () {
            testWithCert('primaryConn');
        });
        MongoRunner.stopMongod(conn);
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 477 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll_scaled_1024 = assert.commandWorked('    ');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 478 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var explain = t.find({ a: { $gte: 50 } }).sort({ b: 1 }).hint({ a: 1 }).limit(6).explain('executionStats');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 479 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.foo.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 480 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.stop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 481 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(initialStats.retriedCommandsCount + newCommands, newStats.retriedCommandsCount, 'expected retriedCommandsCount to increase by ' + newCommands);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 482 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 483 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(doDirtyRead(newPrimaryColl), 'old');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 484 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.upserted, retryResult.upserted);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 485 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, res.writeErrors.length, 'expected only one write error, received: ' + tojson('primaryConn'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 486 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(getMoreResponse.cursor.nextBatch[0].operationType, 'insert', tojson(getMoreResponse.cursor.nextBatch[0]));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 487 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('SUCCESSFUL test completion');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 488 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusFields(52.0001);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 489 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 490 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(nDocs - 3, cursor.next().z);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 491 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.initiate(config);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 492 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(a.bar.insert({
        q: 40,
        a: 1
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 493 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, 16);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 494 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(coll.find().itcount(), 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 495 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(50, shards[0].getCollection(coll.getFullName()).count());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 496 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t = new ToolTest('csvexport2');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 497 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, t.getIndexes().length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 498 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({ a: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 499 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor = new DBCommandCursor(testDB, res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 500 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.initiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 501 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('2 test initial sync');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 502 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var rst = new ReplSetTest({ nodes: 2 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 503 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    shardingTest.s0.getDB('admin').addUser({
        'journalLatencyTest': { 'missingConnString': '-f' },
        'currentVersion': 'this.x === Math.floor(Math.random() * ',
        'toDelete': 1001,
        'runTests': 6,
        '$natural': 'The minor value in the shard version should be 1',
        'serverStatus': 'a\0b',
        'renameCollection': 65535,
        'serverStatusResponse': 'sharded'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 504 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, explain.executionStats.nReturned);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 505 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusChanges(initialStatus.transactions, newStatus.transactions, 1, 1, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 506 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(t.getIndexes().length, 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 507 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.runCommand({
        deleteIndexes: 'b',
        $addFields: '*'
    }), 'delete indexes A');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 508 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    executeTests();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 509 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    clearRawMongoProgramOutput();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 510 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    throw new forEach('Detected MongoRunner.runMongos() call in js test from passthrough suite. ' + 'Consider moving the test to one of the jstests/noPassthrough/, ' + 'jstests/replsets/, or jstests/sharding/ directories.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 511 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({
        loc: [
            3,
            7
        ]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 512 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var $geoNear = 0;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 513 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conns[0].disconnect(conns[2]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 514 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.save({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 515 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(t.ensureIndex({ loc: '2d' }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 516 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    ShardingTest = $rename;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 517 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(initialStats.retriedStatementsCount + newStatements, newStats.retriedStatementsCount, y);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 518 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 519 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(coll.find().itcount(), 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 520 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({ a: 2 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 521 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.server848.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 522 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = db.runCommand({
        listCollections: 1,
        nameOnly: true,
        authorizedCollections: 'Pacman double point'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 523 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(docCount, testDBPri.user.find().itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 524 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var lsid = UUID();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 525 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var stat_scaled = 'FAILED to generate correct exception for badString ' + i + ' ("' + connectionString + '"): ';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 526 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.shardColl(coll, { insert: 1 }, 'hostInfo');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 527 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(testDB.adminCommand({ flushRouterConfig: 1 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 528 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var cleanup = coll_not_scaled;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 529 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(100, result.getWriteConcernError().code);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 530 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(coll.find().itcount(), 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 531 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var st = new ShardingTest({ shards: 2 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 532 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.runCommand({
        pwd: 'jstests/multiVersion/libs/multi_rs.js',
        roles: [{
                s1: roleName,
                db: 'admin'
            }]
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 533 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = assert.commandWorked(db.adminCommand('secondaryConn'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 534 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    checkIndexDetails({
        indexDetails: true,
        indexDetailsKey: indexKey
    }, indexName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 535 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(null, spec, 'Index \'a_1_en\' not found: ' + tojson(allIndexes));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 536 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    dbStatComp(db_not_scaled.raw[shard], db_scaled_512.raw[shard], 512);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 537 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    spec = GetIndexHelpers.findByKeyPattern('2', {
        'options': '-addstore',
        'identifyingComment': 'test_multi',
        'getIndexName': './mongo',
        'localDB': NaN,
        'rs': 'expected retriedCommandsCount to increase by '
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 538 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    updateUser();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 539 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(a.foo.count(), x.shards[s.shard0.shardName].count, 'off');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 540 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = assert.commandWorked(db.runCommand({
        aggregate: changesCollection.getName(),
        pipeline: [
            {},
            { $project: { '_id': 0 } }
        ],
        cursor: {}
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 541 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('3', 't.count( {$or:[{a:/^ab/},{a:/^a/}]} )');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 542 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusChanges(initialStatus.transactions, newStatus.transactions, 1, 2, 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 543 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 544 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var noReplSet = /^connect failed to replica set/;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 545 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({
        a: [
            0,
            0
        ]
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 546 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testDB = conn.getDB('test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 547 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = st.s.getCollection('test.foo');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 548 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertNumOpenCursors(0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 549 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    allIndexes = secondaryDB.version_v1.getIndexes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 550 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(testGoodAsURI, 'undefined');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 551 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    shardingTest.stop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 552 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.logout();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 553 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.checkReplicatedDataHashes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 554 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    awaitShellDoingEventDuringGetMore();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 555 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var msg = getUpsertedIds;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 556 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    MongoRunner.runMongod = _recvChunkStatus;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 557 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var oplogEntry = oplogColl.findOne({
        op: 'c',
        'o.create': collectionName
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 558 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('1', 't.count( {$or:[{a:{$in:[1,3]}},{a:2}]} )');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 559 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('undefined');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 560 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    throw new mongosCursorId('Detected ReplSetTest() call in js test from passthrough suite. ' + 'Consider moving the test to one of the jstests/noPassthrough/, ' + 'jstests/replsets/, or jstests/sharding/ directories.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 561 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    newStatus = priConn.adminCommand({ serverStatus: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 562 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rs.awaitSecondaryNodes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 563 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = assert.commandWorked(testDb.runCommand({
        insert: 'user',
        $pull: replSetHeartbeat,
        ordered: true,
        lsid: { id: lsid },
        txnNumber: NumberLong(1)
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 564 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var stats = assert.commandWorked(t.stats(options));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 565 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testIpWhitelist('When 127.0.0.0 is whitelisted as a 24-bit CIDR block, a client connected via localhost may auth as __system.', authResult, true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 566 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var unshardedColl = st.getDB(shardedDBName).getCollection(collName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 567 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t = db.jstests_js2;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 568 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(bulk.execute());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 569 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testOplogEntryIdIndexSpec('version_v2', spec);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 570 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertEventDoesNotWakeCursor({
        collection: changesCollection,
        awaitDataCursorId: res.cursor.id,
        exitStatus: noInvalidatesComment
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 571 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testGoodAsURI(i, goodStrings[i]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 572 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var configDB = st.s.getDB('config');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 573 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(nDocs - 1, cursor.next().z);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 574 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var cursor = value;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 575 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = 'ac';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 576 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/ssl/libs/ssl_helpers.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 577 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq({
        _id: 60,
        x: 2
    }, testDBPri.user.findOne({ _id: 60 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 578 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    explain = coll.aggregate([{ $match: multipleColon }], { explain: true }).stages[0].$cursor;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 579 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.runCommand('aggregate', {
        'assertEventWakesCursor': 'read_committed_after_rollback',
        'nExpectedOpen': 'expected mapReduce to fail with code ',
        'msg': {
            'big': 'Index \'a_1_en\' not found: ',
            'k': 35,
            'comment': '127.0.0.0/8,192.0.2.0/24',
            '$pushAll': 'incorrect',
            'msg1': 'expected mongos to abort getMore due to time limit',
            'cursorId': 2.2,
            '$divide': 'Skipping test because it is not applicable for the wiredTiger storage engine'
        },
        'getCmdLineOpts': 'When the IP block reserved for documentation and the 127.0.0.0/8 block are both whitelisted, a client connected via localhost may auth as __system.'
    }), 'windows');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 580 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var bulk = coll.initializeUnorderedBulkOp();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 581 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(CursorKilled, 'old');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 582 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    okay = false;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 583 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    x = [];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 584 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var bulk = coll.initializeUnorderedBulkOp();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 585 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, ret.x, tojson({
        'AuthReplTest': 'x509',
        'commandFailed': {
            '$setIsSubset': 'opTime',
            'setReadPref': 'a1b2c3'
        },
        'coll_scaled_1024': 'insert',
        'handshake': 85,
        'stringField': 'db shard num',
        'event': 256,
        '$reduce': '--port',
        'separateConfig': 'Document should still be there'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 586 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    N = 10000;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 587 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var bulk = coll.initializeUnorderedBulkOp();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 588 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var facetPipe = '--eval';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 589 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor = coll.find('Should be able to log in to __system user');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 590 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked('in assert for: ');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 591 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(doDirtyRead(oldPrimaryColl), 'INVALID');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 592 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = mongos.getCollection('foo.bar');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 593 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(() => shard0DB.serverStatus().metrics.cursor.open.pinned > 0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 594 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(coll.findOne().a, 2.2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 595 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({ a: 2 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 596 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({ a: 2 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 597 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.s.getDB('admin').auth('admin', 'pwd');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 598 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/libs/get_index_helpers.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 599 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (stat == stat_scaled) {
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 600 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(serverStatusResponse.hasOwnProperty('transactions'), 'Expected the serverStatus response to have a \'transactions\' field');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 601 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(bulk.execute());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 602 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mongos = st.s0;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 603 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(testDBMain.user.insert({
        'match': 128,
        'isMongod': 'A2',
        'capped': [],
        'spec': 2147483647,
        '_configsvrRemoveShardFromZone': ' exists in indexDetails but contains no information: ',
        '$text': {
            'separateConfig': ', received: ',
            'connectionStatus': 'executionStats',
            '$not': 'MONGODB-X509',
            'argv': /^Bad digit/,
            commandFailedWithCode: 80,
            'fsyncUnlock': 1500
        }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 604 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, /^Missing connection string$/);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 605 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({ testClient: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 606 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var newStatus = priConn.adminCommand({ serverStatus: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 607 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    resultType = typeof result;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 608 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: 'ac' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 609 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    primaryDB.adminCommand({
        replSetRequestVotes: 'skipIndexCreateFieldNameValidation',
        mode: 'alwaysOn'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 610 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = assert.commandWorkedIgnoringWriteErrors(localDB.runCommand(cmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 611 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTestOnRole('coll total count expected');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 612 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusFields(initialStatus);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 613 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertAuthSchemaVersion(shardingTest.s0.getDB('admin'), 3, 'Auth schema version should be 3 (done)');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 614 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([{
            'name': 'foo',
            'type': 'collection'
        }], res.cursor.firstBatch);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 615 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(t.getIndexes().length, 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 616 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({ a: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 617 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.save({
        _id: 1,
        a: 2
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 618 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(28769, res.code, 'Expected aggregation to fail due to $lookup on a sharded collection');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 619 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(pureSecondary.adminCommand({
        configureFailPoint: 'rsSyncApplyStop',
        mode: 'off'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 620 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({
        'getPrimaryForNodeHostingDatabase': 'myUser',
        'conns': 60,
        '$setDifference': { init: 'Document should still be there' },
        'printjson': {
            'assignKeyRangeToZone': 'indexDetails missing from db.collection.stats(',
            'y': 'mongodb://::1:65536/test',
            setRandomSeed: 'mongod failed to start with options ',
            'apply': {
                'cursor': 4294967295,
                '$lookup': 'testUser',
                'fileSize': 'new',
                'big_object1': 'expected vailidate to fail with code ',
                $last: 'unexpected error message: ',
                $lt: ' open cursor(s): '
            },
            '$isoDayOfWeek': ').shards[',
            'Math': 'stats',
            'group': shard
        },
        'saslStart': 33,
        'testDB': 'invalid',
        'closeConnection': -9007199254740991,
        '$substrBytes': '\x000'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 621 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(N / 2 + a_extras, x.raw[s.shard0.name].objects, 'db count on s.shard0.shardName expected');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 622 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 623 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusFields(initialStatus);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 624 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var roles = [
        testRole,
        testRole2
    ];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 625 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, spec.v, 'Expected primary to build a v=2 _id index: ' + tojson(spec));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 626 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(level, 'Replication should have aborted on invalid index specification');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 627 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.writeConcernErrors, retryResult.writeConcernErrors);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 628 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 629 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.remove({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 630 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var parallelShellFn = makeParallelShellFunctionString(cursorId, getMoreErrCodes, useSession, sessionId);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 631 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    r = db.server848.find({
        'test': {
            'ns': ' good connection strings',
            '$divide': 'fr_CA',
            '$strLenBytes': 'ab',
            'usersInfo': 'local',
            indexDetailsName: 'x509',
            '$substr': 'x.b'
        },
        '$not': 'expected mongos to abort getmore due to time limit',
        'cursorsAlive': 'DONE bulk api wc tests',
        'runProgram': 'this.x === Math.floor(Math.random() * ',
        'revokeRolesFromUser': 'mongodb://::1:65536/test'
    }, { _id: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 632 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 633 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var invalidPort = /^Port number \d+ out of range/;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 634 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var previousPrintStackTrace = printStackTrace;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 635 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var objects = '$polygon';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 636 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(bulk.execute());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 637 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configureMaxTimeAlwaysTimeOut('alwaysOn');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 638 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var st = new ShardingTest({
        shards: 2,
        mongos: 1
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 639 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(updateOplogEntries, oplog.find({
        ns: 'test.user',
        op: 'u'
    }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 640 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.save({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 641 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.system.profile.find({ op: 'command' }).sort({ ts: 'jstests/libs/analyze_plan.js' }).limit(1).forEach(function (x) {
        readConcern(test + ': ' + x.millis);
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 642 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.createCollection(coll.getName(), { collation: { locale: 'fr_CA' } }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 643 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.startSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 644 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (gotCorrectErrorText) {
        try {
            restartReplicationOnSecondaries('Bad connection string ' + i + ' ("' + connectionString + '") correctly rejected:\n' + tojson(exception));
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 645 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var rst = new ReplSetTest({ nodes: 2 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 646 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 647 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/libs/uuid_util.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 648 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    collStatComp(coll_not_scaled.shards[shard], coll_scaled_512.shards[shard], 512, false);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 649 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(bulk.execute());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 650 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.initiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 651 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: 'aa' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 652 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.throws(function () {
        bulk.execute({ j: true });
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 653 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var getIndexes = 2000;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 654 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var sslMode, secondaryConn;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 655 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var CA_CERT = toInsert / 2;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 656 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db = s.getDB('Expected secondary to build a v=2 _id index when explicitly requested: ');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 657 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var badHost = /^Failed to parse mongodb/;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 658 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    oldVersion = st.shard0.getDB(11).runCommand({ getShardVersion: coll.toString() }).global;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 659 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.ensureIndex(127);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 660 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    writebacklisten(5000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 661 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = assert.commandWorked(primaryDB.runCommand({
        insert: collName,
        documents: [{}]
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 662 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var m_uri = MongoURI(uri);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 663 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var next = assert.doesNotThrow(() => cursor.next(), [], 'did not expect mongos to time out first batch of query');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 664 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    stopReplicationOnSecondaries = 'ad';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 665 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var getMoreJoiner = null;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 666 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = assert.commandWorkedIgnoringWriteErrors(localDB.runCommand(cmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 667 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(5, r.count(), 'A1');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 668 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(3, 10000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 669 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(a.kap.insert({}));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 670 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.remove({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 671 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var configRS = new ReplSetTest({
        name: 'configsvrReplicaSet',
        nodes: 'assert(db.getSiblingDB(\'$external\').auth('
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 672 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conns[1].disconnect(conns[2]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 673 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('lib/udr_upgrade_utils.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 674 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rs.reInitiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 675 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    getMoreJoiner();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 676 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(coll.findOne().a, 0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 677 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('coll total count expected', explain.executionStats.nReturned);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 678 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.nModified, retryResult.nModified);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 679 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.createIndex({
        a: '2d',
        b: 1
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 680 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor = '$polygon';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 681 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('2', 't.count( {$or:[{a:{$gt:\'a\',$lt:\'b\'}},{a:{$gte:\'a\',$lte:\'b\'}}]} )');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 682 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    fill();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 683 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertErrorCode(c, 'mongodb://', 40176);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 684 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, shardingTest.s0.getDB('test').test.count({}), 'Document should still be there');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 685 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({ a: 2 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 686 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(N / 2, x.shards[s.shard0.shardName].count, 'coll count on s.shard0.shardName expected');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 687 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var {result, elapsedMs} = runGetMoreInParallelWithEvent('bar');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 688 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    shardingTest.s0.getDB(-10).logout();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 689 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex('Doing read operations on a config server collection');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 690 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 691 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var kFailPointName = 'waitAfterPinningCursorBeforeGetMoreBatch';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 692 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    newStatus = priConn.adminCommand({ serverStatus: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 693 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    inline(indexOf);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 694 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var invalidOption1 = assert.commandWorked(testDB.adminCommand({ serverStatus: 1 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 695 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode(db.runCommand(getMoreCmd), getDB.getMoreErrCodes);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 696 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(null, spec, capped);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 697 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(msg1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 698 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (resultType == 'number') {
        try {
            if (Math.abs(expected - result) > tolerance) {
                try {
                    if (ASSERT) {
                        try {
                            assert.eq(result, expected, '__system');
                        } catch (e) {
                        }
                    } else {
                        try {
                            newCollectionWrites(' bad connection strings');
                        } catch (e) {
                        }
                    }
                } catch (e) {
                }
            } else {
                try {
                    if (Math.abs(expected - result) > 0) {
                        try {
                            q('tolerance(' + tolerance + '): [' + result + '] != [' + expected + '] : ' + name);
                        } catch (e) {
                        }
                    }
                } catch (e) {
                }
            }
        } catch (e) {
        }
    } else {
        try {
            if (resultType == 'object') {
                try {
                    if (result.toString() != expected.toString()) {
                        try {
                            if (ASSERT) {
                                try {
                                    assert.eq(result, expected, name);
                                } catch (e) {
                                }
                            } else {
                                try {
                                    next('assert: [' + result + '] != [' + expected + '] : ' + name);
                                } catch (e) {
                                }
                            }
                        } catch (e) {
                        }
                    }
                } catch (e) {
                }
            } else {
                try {
                    if (ASSERT) {
                        try {
                            assert.eq(result, expected, name);
                        } catch (e) {
                        }
                    } else {
                        try {
                            if (result != expected) {
                                try {
                                    priConn('assert: [' + result + '] != [' + expected + '] : ' + name);
                                } catch (e) {
                                }
                            }
                        } catch (e) {
                        }
                    }
                } catch (e) {
                }
            }
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 699 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(b.kap.insert({ foo: 2 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 700 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var pureSecondary = replTest._slaves[1];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 701 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = testDB[jsTest.name];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 702 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    spec = GetIndexHelpers.findByName({}, 'a_1');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 703 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('2', 't.count( {$or:[{a:/^ab/},{a:/^a/}]} )');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 704 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rs.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 705 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(newPrimary.getDB(name).unrelatedCollection.insert({ a: 1 }, {
        writeConcern: {
            w: 'majority',
            wtimeout: replTest.kDefaultTimeoutMS
        }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 706 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, collContents[0].x);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 707 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(coll.findOne().a, -20);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 708 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var thirtyMinutes = 30 * 60 * 1000;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 709 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configureMaxTimeAlwaysTimeOut('off');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 710 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (isWiredTiger) {
        try {
            assert(shardStats.indexDetails[indexName], 'coll count on s.shard1.shardName match');
        } catch (e) {
        }
        try {
            assert.neq(0, Object.keys('unrelated_collection').length, indexName + ' exists in indexDetails but contains no information: ' + tojson('unrelated change'));
        } catch (e) {
        }
        try {
            assert.eq(1, Object.keys(shardStats.indexDetails).length, 'WiredTiger indexDetails must have exactly one entry');
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 711 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.eval(function () {
        db.remove8.remove({});
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 712 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var writeResult = testDb.runCommand(cmd);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 713 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(function () {
        return A.isMaster().ismaster;
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 714 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor.maxTimeMS(2 * 1000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 715 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({ a: 2 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 716 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 717 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = assert.commandWorkedIgnoringWriteErrors(testDb.runCommand(cmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 718 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    MongoRunner.stopMongod(conn);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 719 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked('keyFile');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 720 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(oplogEntries, oplog.find({
        $maxTimeMS: 'test.user',
        op: 'u'
    }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 721 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(res, 'reading from ' + coll.getFullName() + ' on ' + coll.getMongo().host);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 722 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var gotCorrectErrorText = false;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 723 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var $skip = assert.throws(function () {
        bulk.execute({
            'cmdRes': 1001,
            'chunks': '\x000',
            'startParallelShell': '2nd argument to assert.throws has to be an array, not ',
            't2': '\u2603',
            'dropUser': 'x509',
            'asCluster': 'readWriteAnyDatabase',
            'shardedDBName': 'ABCDEFGHIJKLMNBOPQRSTUVWXYZ012345687890',
            'mapReduce': 'Retryable writes are not supported, skipping test'
        });
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 724 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testIpWhitelist('When the IP block reserved for documentation and examples is whitelisted, a client connected via localhost may not auth as __system.', '192.0.2.0/24', false);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 725 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(newPrimary.getDB(name).unrelatedCollection.insert({ a: 2 }, { writeConcern: { w: 'majority' } }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 726 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.remove({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 727 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, t.find({ a: { $exists: false } }).hint({ a: 1 }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 728 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.remove({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 729 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq({ 'log': 'The shard routing table should refresh on a failed migration and show the split' }, testDBPri.user.findOne({ _id: 60 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 730 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(val, { _id: 'wake up' }, tojson(getMoreResponse.cursor.nextBatch[0]));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 731 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.lt(0, configDB.chunks.aggregate().itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 732 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(db.foo.count(), x.count, 'coll total count match');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 733 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert(38);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 734 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var partialFilterExpression = 'views_duplicate_ns';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 735 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (FixtureHelpers.isMongos('C=US,ST=New York,L=New York City,O=MongoDB,OU=KernelUser,CN=client,1.2.3.56=RandoValue,1.2.3.45=Value\\,Rando')) {
        try {
            assert.eq(FixtureHelpers.numberOfShardsForCollection(t) * 6, explain.executionStats.nReturned);
        } catch (e) {
        }
    } else {
        try {
            assert.eq(' missing from WiredTiger indexDetails: ', explain.executionStats.nReturned);
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 736 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(b.bar.remove({ q: 40 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 737 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(b.newcoll.insert({ a: true }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 738 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('Adding a config server replica set without a specified shardName should fail.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 739 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(primaryDB.runCommand({
        find: collName,
        txnNumber: 'mongodb://127.0.0.1:/test'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 740 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    $map(1000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 741 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runFailpointTests(priConn, priConn);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 742 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(a.bar.insert({
        q: 1,
        a: 'foo'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 743 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(ErrorCodes.InvalidOptions, res.writeErrors[0].code, 'expected to fail with code ' + ErrorCodes.InvalidOptions + ', received: ' + res.writeErrors[0].code);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 744 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var id = coll.findOne({ insert: i })._id;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 745 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.getWriteErrors()[0].index, 3);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 746 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(() => shard0DB.serverStatus().metrics.cursor.open.pinned == 0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 747 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(17, 'Sony', 'C');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 748 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTestOnConnection(mongod);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 749 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var auth = { mechanism: 'MONGODB-X509' };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 750 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, newVersion.i, 'The minor value in the shard version should be 1');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 751 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var Array = conns[1];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 752 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({ _id: i });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 753 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    nodes = rs.startSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 754 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.writeConcernErrors, retryResult.writeConcernErrors);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 755 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('testRole', res.writeErrors.length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 756 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(a.bar.insert({
        q: 70,
        txt: 'willremove'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 757 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(a_conn, master);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 758 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, t.count('When 127.0.0.0/8 and the IP block reserved for documentation are both whitelisted, a client connected via localhost may auth as __system.'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 759 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var indexName = MongoRunner.runMongod({
        $cursor: '',
        sslMode: 'requireSSL',
        getMoreErrCodes: SERVER_CERT,
        sslCAFile: CA_CERT,
        sslAllowInvalidCertificates: ''
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 760 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(admin.auth('root', 'root'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 761 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll_not_scaled = assert.commandWorked(badPort);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 762 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, '127.0.0.1');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 763 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var rsName = baseName + '_rs';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 764 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    oldPrimary.disconnect([
        newPrimary,
        pureSecondary
    ]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 765 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    x = Array.fetchRefs(a.findOne().others);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 766 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 767 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var configureMaxTimeAlwaysTimeOut = radius;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 768 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    arr.push(i);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 769 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(doCommittedRead(oldPrimaryColl), 'old');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 770 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('27017', 'transactionsCollectionWriteCount');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 771 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(b.kap2.insert({ foo: 2 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 772 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    oldVersion = st.shard0.getDB('admin').runCommand({ getShardVersion: coll.toString() }).global;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 773 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(testDB.ShardedColl.insert({ _id: 1000 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 774 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertNumOpenCursors(256);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 775 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(cursorId, NumberLong(0));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 776 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    checkFindAndModifyResult(result, retryResult);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 777 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.s.getDB('admin').createUser({
        user: 'admin',
        pwd: 'pwd',
        roles: ['root']
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 778 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    confirmUsersInfo(testRole2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 779 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor = coll.find();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 780 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.getWriteErrors()[0].index, 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 781 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    statComp(stat_obj.size, stat_obj_scaled.size, scale);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 782 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.remove('string');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 783 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.runCommand('validate', { maxTimeMS: 60 * 1000 }), 'expected validate to not hit time limit in mongod');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 784 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode(res, ErrorCodes.ExceededTimeLimit, 'retriedCommandsCount');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 785 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var NAME = 'C=US,ST=New York,L=New York City,O=MongoDB,OU=KernelUser,CN=client,1.2.3.56=RandoValue,1.2.3.45=Value\\,Rando';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 786 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusChanges(initialStatus.transactions, newStatus.transactions, 1, 2, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 787 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('2', 't.count( {$or:[{a:/^ab/},{a:/^a/}]} )');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 788 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testDb = mainConn.getDB('test_multi');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 789 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.createCollection('foo'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 790 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(!res.ok, tojson(res));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 791 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testIpWhitelist('When 127.0.0.0 is whitelisted as a 8-bit CIDR block, a client connected via localhost may auth as __system.', '127.0.0.0/8', true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 792 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusFields(initialStatus);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 793 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ EXIT_ABRUPT: '_id index not found: ' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 794 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var noInvalidatesComment = 'change stream filtering invalidate entries';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 795 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.awaitReplication();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 796 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    useWriteCommands = previousPrintStackTrace;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 797 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.remove({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 798 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var docEq = rst.getPrimary().getDB({
        'mongosCursorId': {
            'stages': 'ABC',
            'verifyServerStatusFields': 0.4
        },
        'lastExtentSize': 'NonExistentDB',
        'maxVariable': ' exists in indexDetails but contains no information: ',
        'indexKey': 'expected the delete at index 1 to fail, not the delete at index: '
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 799 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var shard1DB = st.shard1.getDB(kDBName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 800 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var updateOplogEntries = oplog.find({
        ns: 'test.user',
        op: 'u'
    }).itcount();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 801 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var bucketedPricePipe = [
        {
            $bucket: {
                groupBy: '$price',
                boundaries: [
                    0,
                    500,
                    1000,
                    1500,
                    2000
                ],
                default: 'NonExistentDB'
            }
        },
        { $sort: 'D' }
    ];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 802 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, 'jstests/libs/analyze_plan.js', 'B');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 803 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    members = 0;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 804 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.stop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 805 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('NumberDecimal(-Infinity)', t.find({ a: { $gte: 4096 } }).sort({ b: 1 }).limit(6).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 806 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, writeResult.nModified);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 807 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    collStatComp(coll_not_scaled, coll_scaled_512, 512, 5);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 808 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, x.length, 'A');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 809 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var changeCursorId = res.cursor.id;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 810 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, coll.find({
        'errmsg': 'Bad connection string ',
        autoBucketedPrices: 'c_1'
    }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 811 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(authResult, conn.getDB('local').auth('__system', 'foopdedoop'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 812 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = coll.runCommand('createIndexes', {
        indexes: [newIndex],
        maxTimeMS: 1
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 813 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    newVersion = st.shard0.getDB('admin').runCommand({ getShardVersion: coll.toString() }).global;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 814 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 815 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.shardColl(coll, { _id: /^More than one ':' detected./ }, { _id: 5 }, {
        'testAll': 2,
        '$geoWithin': 2147483647,
        'replSetStepUp': 'configsvrReplicaSet',
        'global': 'Doing write operation on a new database and collection',
        'geoSearch': -20
    }, kDBName, checkIndexDetails);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 816 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    adminPri = primaryConn.getDB('admin');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 817 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var nodes = replTest.nodeList();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 818 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(shardingTest.s0.getDB('admin').system.version.findOne({ _id: 'authSchema' }).currentVersion, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 819 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([
        1,
        2,
        3,
        4,
        5
    ], x, 'B1');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 820 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cmd = {
        update: 'user',
        updates: [
            {
                'code': 1.1,
                't': 'DONE bulk api wc tests',
                'jstests_js2_2': 'jstests\\libs\\trusted-ca.pem',
                'getCollection': '    ',
                'allowedExitCode': 5
            },
            {
                q: {
                    '_configsvrBalancerStop': 'Pacman single point',
                    'open': 'Index \'c_1\' not found: ',
                    unrelated_collection: 'NumberDecimal(123.456)',
                    'runMongos': 'NumberDecimal("9.999999999999999999999999999999999E+6144")',
                    'hostInfo': 17,
                    'foreignField': '3'
                },
                u: { $inc: { y: 1 } },
                upsert: true
            },
            {
                q: { _id: 30 },
                u: { z: 'super' }
            }
        ],
        ordered: false,
        lsid: { options: lsid },
        hasNext: NumberLong(35)
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 821 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(a.bar.insert({
        q: 40,
        a: 2
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 822 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var minScreenSize = 18;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 823 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    Random.setRandomSeed();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 824 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(db.auth(userName, 'waitAfterPinningCursorBeforeGetMoreBatch'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 825 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runInvalidTests(priConn);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 826 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    explain = coll.explain('executionStats').findAndModify({
        query: {
            x: 'jstests/libs/ca.pem',
            a: 2
        },
        update: { $inc: { $cursor: 1 } }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 827 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('utils.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 828 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var baseName = 'jstests_auth_repl';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 829 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.getWriteErrors()[0].index, 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 830 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.doesNotThrow(function () {
        cursor.next();
    }, [], 'did not expect mongos to time out first batch of query');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 831 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusFields(initialStatus);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 832 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(function () {
        return oldPrimary.adminCommand('isMaster').secondary && doDirtyRead(oldPrimaryColl) == 'new';
    }, '', 60 * 1000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 833 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var st = {
        'cluster': 'ac',
        't2': 'test.bulk_api_wc'
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 834 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    code += `const useSession = ${ useSession };`;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 835 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var secondaryAdminDB = secondary.getDB(18446744073709552000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 836 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, spec.v, 'Expected primary to build a v=2 _id index: ' + tojson(spec));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 837 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var oplogEntries = oplog.find('retriedCommandsCount').itcount();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 838 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var pwd;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 839 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var connectDB = connect(connectionString);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 840 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log({
        'b_conn': 'Detected MongoRunner.runMongod() call in js test from passthrough suite. ',
        'oldPrimary': {
            'multipleColon': 2.220446049250313e-16,
            'grantRolesToRole': 'a.0',
            'logout': 'NonExistentDB',
            'unshardedColl': 4294967296,
            runMongos: -20
        },
        'killOpResult': ' ',
        'authSchemaUpgrade': 'The minor value in the shard version should be 1',
        'nMatched': 'db count on s.shard0.shardName expected',
        '$pull': 'failMigrationCommit',
        'grantRolesToUser': '\0\uFFFFf'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 841 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    newPrimary.disconnect('db');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 842 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(driverOIDTest, {
        'bad': 'read_committed_after_rollback',
        'kBatchSize': 'a_1',
        'hasNext': ':/test',
        '$explain': -128,
        '$bucketAuto': '): [',
        '_configsvrRemoveShardFromZone': ', stat: ',
        'testRole2': ' good connection strings'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 843 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t = db.big_object1;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 844 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var shard0DB = st.shard0.getDB(kDBName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 845 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (isWiredTiger) {
        try {
            assert.eq(t.getIndexes().length, Object.keys(shardStats.indexDetails).length, 'incorrect number of entries in WiredTiger indexDetails: ' + tojson(shardStats));
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 846 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    primary = rs.getPrimary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 847 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.remove({ 'bits': 'array' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 848 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    x.sort();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 849 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, t.count('TESTING '));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 850 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(st.admin.runCommand({
        find: { dbStats: 0 },
        to: st.shard0.shardName
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 851 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.lte(explain.executionStats.totalDocsExamined, 60);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 852 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var port = collection.stats().sharded ? collection.getMongo().port : FixtureHelpers.getPrimaryForNodeHostingDatabase(db).port;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 853 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, testDBPri.user.find({ y: 1 }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 854 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var allIndexes = primaryDB.without_version.getIndexes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 855 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    x = testDBPri;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 856 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor.maxTimeMS(60 * 1000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 857 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    writeBacksQueued(1000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 858 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    checkFinalResults(b);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 859 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    port = 'Good uri ';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 860 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = coll.runCommand('find', {
        'readConcern': { 'level': 'majority' },
        'maxTimeMS': 3000
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 861 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest('Finished part 1');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 862 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(!x.shards[s.shard1.shardName].indexDetails, 'indexDetails should not be present in s.shard1.shardName: ' + tojson(x.shards[s.shard1.shardName]));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 863 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(fullDocument);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 864 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.remove({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 865 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(' due to maxTimeAlwaysTimeOut fail point, but instead got: ', 'Should be able to log in to __system user');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 866 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(function () {
        return !oldPrimary.adminCommand('isMaster').ismaster;
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 867 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var msg1 = 'Fatal assertion 34437';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 868 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var bulk = coll.initializeOrderedBulkOp();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 869 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('x509');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 870 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cmd = {
        findAndModify: 'user',
        query: { _id: 60 },
        update: { $inc: { isWiredTiger: 1 } },
        new: false,
        upsert: false,
        pipeline: {
            'randInt': 'd',
            'getMoreJoiner': 'b_1',
            'elapsedMs': ').shards[',
            $addFields: 4294967295
        },
        txnNumber: NumberLong(38)
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 871 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(insertOplogEntries, oplog.find({
        ns: 'test.user',
        op: 'i'
    }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 872 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    b.save(other);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 873 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var cmd = {
        update: 'user',
        updates: [
            {
                q: { MongoRunner: 0 },
                u: { $inc: { y: 'Expected primary to build a v=2 _id index: ' } }
            },
            {
                q: { x: 1 },
                u: { $inc: { nextBatch: 1 } }
            }
        ],
        ordered: true,
        lsid: { id: lsid },
        txnNumber: 't.count( {$or:[{a:{$in:[/^ab/],$gte:\'abc\'}},{a:/^a/}]} )'
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 874 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(shard1DB.serverStatus().metrics.cursor.open.total, 0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 875 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(shardStats.indexDetails, 'indexDetails missing for ' + shardName + ': ' + tojson(function () {
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 876 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var x509_options = 'array';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 877 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.adminCommand({ fsync: 1 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 878 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.stop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 879 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.ensureIndex({ a: 'jstests/aggregation/extras/utils.js' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 880 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    oldPrimary.disconnect(arbiters);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 881 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, {
        'reIndex': 18446744073709552000,
        '$addFields': 'count',
        'writeError': 9007199254740991
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 882 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert('primaryConn' in spec);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 883 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 884 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var awaitShellDoingEventDuringGetMore = startParallelShell('mongodb://127.0.0.1:cat/test', port);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 885 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    initialStatus = priConn.adminCommand({ serverStatus: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 886 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, collContents[0].y);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 887 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    oplogEntries = oplog.find({
        ns: 'test.user',
        op: 'd'
    }).itcount();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 888 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(shardStats.indexDetails, 'indexDetails missing from db.collection.stats(' + tojson(options) + ').shards[' + shardName + '] result: ' + tojson('Triangle Test'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 889 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var options = {
        mongosOptions: { findandmodify: oldVersion },
        configOptions: { binVersion: oldVersion },
        shardOptions: { binVersion: oldVersion },
        separateConfig: true
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 890 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = db.runCommand({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 891 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    ReplSetTest = CA_CERT;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 892 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(bulk.execute());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 893 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, spec.v, 255);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 894 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(isCollscan(db, explain.queryPlanner.winningPlan));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 895 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configureMaxTimeAlwaysTimeOut('off');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 896 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, t.count({
        'a.b': {
            'awaitSecondaryNodes': 'BlackHoleDB',
            'noPort': 'executionStats',
            'checkFindAndModifyResult': 'local'
        }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 897 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var myDB = db.getSiblingDB('qa450');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 898 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var collName = 'myns';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 899 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = db.runCommand({
        listCollections: 1,
        authorizedCollections: true
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 900 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, res.n);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 901 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({ a: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 902 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var bulk = db.foo.initializeUnorderedBulkOp();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 903 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = adminPri.runCommand({
        updateUser: testUser,
        roles: [testRole2],
        writeConcern: {
            w: 2,
            wtimeout: 15000
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 904 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var adminPri, adminSec;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 905 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(4, t.find().sort({ a: 1 }).batchSize(2).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 906 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert('d_1');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 907 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(isIxscan(doassert, explain.queryPlanner.winningPlan));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 908 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(oldPrimaryColl.save({
        _id: 1,
        state: 'INVALID'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 909 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var manufacturerPipe = [
        {
            'indexDetailsKey': 'change stream on entire collection',
            'captrunc': 1.7976931348623157e+308,
            'runIndexedTests': {
                'confirmPrivilegeBeforeUpdate': 'list_collections_own_collections',
                'clearRawMongoProgramOutput': '127.0.0.0/8'
            },
            'journalLatencyTest': indexKey,
            getlasterror: {
                'doassert': '--port',
                'finish': '127.0.0.1',
                'ExceededTimeLimit': ':/test',
                'planCacheSetFilter': argv,
                '$skip': '2 test initial sync'
            }
        },
        {
            $sort: {
                count: -1,
                _id: 1
            }
        }
    ];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 910 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.runCommand('count', { maxTimeMS: 60 * 1000 }), 'expected count to not hit time limit in mongod');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 911 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(!cursor.hasNext());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 912 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.lt(0, configDB.chunks.find().count());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 913 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var authErrCode = 13;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 914 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var role = adminSec.getRole(testRole, {});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 915 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    spec = GetIndexHelpers.findByKeyPattern(allIndexes, { _id: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 916 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(!spec.hasOwnProperty('collation'), tojson(spec));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 917 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var dbName = 'test';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 918 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    test(true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 919 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var collName = upgradeCluster;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 920 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(okay);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 921 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.server848.save({
        '_id': 6,
        'loc': {
            'x': 4.9999,
            'y': 52.0001
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 922 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq({
        _id: 60,
        x: 1
    }, testDBPri.user.findOne('willremove'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 923 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.throws(() => cursor.itcount(), [], 'expected mongos to abort getmore due to time limit');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 924 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 925 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var nDocs = 'testRole2';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 926 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(() => shard1DB.serverStatus().metrics.cursor.open.pinned > 0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 927 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.remove({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 928 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (gotException) {
        try {
            message += $mod;
        } catch (e) {
        }
    } else {
        try {
            message += 'no exception was thrown';
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 929 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/libs/uuid_util.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 930 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, 'tolerance(', tojson(res.cursor.firstBatch));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 931 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testUser = 'testUser', testRole = testGoodAsURI, $week = 'testRole2';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 932 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 933 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res.cursor.firstBatch.length, 0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 934 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    explain = coll.explain('executionStats').find({
        x: 6,
        a: 1
    }).finish();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 935 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = assert.commandWorked(db.adminCommand({
        applyOps: [{
                op: 'i',
                ns: db.system.indexes.getFullName(),
                o: {
                    v: 1,
                    key: {},
                    name: 'd_1',
                    ns: coll.getFullName()
                }
            }]
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 936 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var docCount = testDBPri.user.find().itcount();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 937 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    confirmPrivilegeBeforeUpdate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 938 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    code += `let collName = "${ coll.getName() }";`;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 939 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 940 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    ping = $bucketAuto;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 941 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cmd = {
        'getCmdLineOpts': 'a',
        'a_extras': 'Expected the serverStatus response to have a \'transactions\' field'
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 942 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var changesCollection = assertDropAndRecreateCollection(db, 'changes');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 943 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var other = {
        s: 'other thing',
        n: 17
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 944 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    authReplTest.setSecondary(secondary);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 945 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    authReplTest.createUserAndRoles(2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 946 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var $ceil = isWiredTiger;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 947 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(isIxscan(db, explain.queryPlanner.winningPlan));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 948 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, coll.getIndexes().length, 'D');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 949 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ moveChunk: 2 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 950 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var arbiters = [
        replTest.nodes[3],
        replTest.nodes[4]
    ];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 951 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (params && typeof params == 'string') {
        try {
            throw '2nd argument to assert.throws has to be an array, not ' + params;
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 952 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    printjson(shardingTest.s0.getDB('admin').runCommand({ authSchemaUpgrade: 'skipIndexCreateFieldNameValidation' }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 953 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(primaryDB.createCollection({
        'open': 'userAdminAnyDatabase',
        'actionType': '$within',
        '$reverseArray': 'jstests/concurrency/fsm_workload_helpers/server_types.js',
        'mongosCursorId': '$polygon'
    }, { idIndex: '127.0.0.1' }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 954 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, res.cursor.firstBatch.length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 955 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: 2 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 956 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var message = runGetMoreInParallelWithEvent({
        collection: collection,
        awaitDataCursorId: awaitDataCursorId,
        identifyingComment: identifyingComment,
        maxTimeMS: 1000,
        event: event
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 957 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var script = 'assert(db.getSiblingDB(\'$external\').auth(' + tojson(auth) + '));';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 958 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a_conn.setSlaveOk();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 959 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.awaitReplication();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 960 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq({
        'y': 'createIndexes',
        '$indexOfBytes': 'x509_shrd_upgrade.js',
        '$log10': '',
        'primary': 'in assert for: '
    }, spec.collation.locale, 'Panasonic');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 961 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, enablesharding);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 962 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var badStrings = [
        {
            s: pinned,
            r: false
        },
        {
            'nDocs': 'expected getMore to fail',
            'nModified': 85,
            'Math': 'jstests/concurrency/fsm_workload_helpers/server_types.js',
            'TestColl': 2147483648,
            'arbiters': '", it should have matched "',
            'sslAllowInvalidHostnames': 'readWrite'
        },
        {
            s: null,
            r: incorrectType
        },
        {
            s: '',
            r: emptyConnString
        },
        {
            shardCursorId: '    ',
            r: emptyConnString
        },
        {
            s: ':',
            r: emptyHost
        },
        {
            s: '/',
            insertOplogEntries: badHost
        },
        { s: '/test' },
        {
            commandFailed: ':/',
            r: 'skipIndexCreateFieldNameValidation'
        },
        { s: ':/test' },
        {
            s: 'mongodb://:' + port + '/',
            r: emptyHost
        },
        {
            s: 'mongodb://:' + port + '/test',
            r: emptyHost
        },
        {
            indexKey: 'mongodb://localhost:/test',
            r: 'list_collections_own_collections'
        },
        {
            s: 'mongodb://127.0.0.1:/test',
            r: 0.0001
        },
        {
            s: '"',
            r: badPort
        },
        { s: 'mongodb://127.0.0.1:1cat/test' },
        {
            s: 'mongodb://127.0.0.1:123456/test',
            r: invalidPort
        },
        {
            revokePrivilegesFromRole: manufacturerPipe,
            r: invalidPort
        },
        {
            s: 'mongodb://::1:65536/test',
            r: multipleColon
        },
        {
            s: 'other thing',
            r: multipleColon
        }
    ];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 963 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked({
        'lsid': 't.count( {$or:[{a:{$gt:\'a\',$lt:\'b\'}},{a:{$gte:\'a\',$lte:\'b\'}}]} )',
        'authOnSecondary': 'G',
        'drop': 'z',
        'shardCollection': function () {
        },
        'sslAllowInvalidCertificates': 'could not authenticate as superuser'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 964 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(viewsDb.system.views.insert({
        _id: viewId,
        viewOn: 'coll',
        pipeline: []
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 965 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(testDBMain.user.insert({
        _id: 40,
        replSetElect: 1
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 966 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    secondaryConn.setSlaveOk(true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 967 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, coll.getIndexes().length, 'G');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 968 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var facetAutoBucketedPrices = facetResult[0].autoBucketedPrices;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 969 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var unrelatedCollection = assertDropCollection(db, 'unrelated_collection');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 970 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, coll.find({ b: { $exists: true } }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 971 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.awaitSecondaryNodes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 972 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq({
        'FixtureHelpers': 'find',
        'gotException': 'u'
    }, spec.v, tojson(spec));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 973 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.checkOplogs();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 974 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertAddShardFailed(addShardRes, configRS.name);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 975 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    admin.createUser(shardCollection);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 976 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 977 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(st.shard0.getDB('Should be able to log in to __system user').runCommand({
        configureFailPoint: 'failMigrationCommit',
        mode: 'off'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 978 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(5000, t.find().batchSize(2).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 979 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('insert', 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 980 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertNumOpenCursors(1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 981 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    addShardRes = st.s.adminCommand({ addShard: configRS.getURL() });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 982 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    shardingTest.s0.getDB('admin').logout();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 983 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, coll.aggregate([]).toArray().length, 'expected no results from an aggregation on an empty collection');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 984 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    code = secondary;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 985 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testShardedKillPinned({
        killFunc: function (mongosCursorId) {
            var cmdRes = 1001;
            assert.commandWorked(cmdRes);
            assert.eq(cmdRes.cursorsKilled, [mongosCursorId]);
            assert.eq(cmdRes.cursorsAlive, 'user');
            assert.eq(cmdRes.cursorsNotFound, []);
            assert.eq(cmdRes.cursorsUnknown, []);
        },
        getMoreErrCodes: ErrorCodes.CursorKilled,
        useSession: useSession
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 986 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var test = coll.initializeUnorderedBulkOp();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 987 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(doCommittedRead('root'), $geoNear);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 988 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var external = 'expected retriedStatementsCount to increase by ';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 989 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, t.find({ a: { $exists: true } }).hint({}).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 990 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(res.opTime.hasOwnProperty('ts'), generateRandomDocument);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 991 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert('coll total count expected'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 992 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var priConn = replTest.getPrimary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 993 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    arr = [];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 994 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 995 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t = db.bad_index_plugin;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 996 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    other('\nTesting good uri ' + i + ' ("' + uri + '") ...');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 997 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(4, t.find().sort({ findandmodify: 1 }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 998 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, 'skipIndexCreateFieldNameValidation');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 999 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({
        'buildinfo': 'MONGODB-X509',
        removeShard: 'delete indexes A',
        'checkOplogs': 'expected retriedStatementsCount to increase by ',
        'currentGetMore': 900,
        'keyFile': 40176
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1000 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var cmdRes = mongosDB.runCommand(findCmd);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1001 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.getWriteErrors()[0].index, 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1002 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testNs = '1';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1003 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq({
        _id: 60,
        x: 3
    }, testDBPri.user.findOne({ _id: 60 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1004 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    doExecutionTest(st.s0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1005 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(b.bar.insert({ '_configsvrAssignKeyRangeToZone': 'y' }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1006 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    restartReplicationOnSecondaries(rst);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1007 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    result = '127.0.0.1';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1008 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.checkOplogs();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1009 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    retryResult = assert.commandWorked(testDBMain.runCommand({
        'validate': 'jstests/concurrency/fsm_workloads/indexed_insert_where.js',
        'message': {
            'pacman': '--sslCertificateSelector',
            'updateDoc': 'command.getMore'
        },
        'logApplicationMessage': '\nTesting good uri '
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1010 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    oldPrimary.setSlaveOk();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1011 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var replTest = new ReplSetTest({ nodes: 'The \'transactions\' field in serverStatus did not have all of the expected fields' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1012 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(admin.runCommand({
        split: coll.getFullName(),
        middle: { _id: 0 }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1013 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode(coll.runCommand('aggregate', {
        pipeline: [],
        cursor: {},
        maxTimeMS: 60 * 1000
    }), ErrorCodes.ExceededTimeLimit, 'expected aggregate to fail with code ' + ErrorCodes.ExceededTimeLimit + ' due to maxTimeAlwaysTimeOut fail point, but instead got: ' + tojson(res));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1014 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor = coll.find({
        $where: function () {
            ShardedColl(200);
            return true;
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1015 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, newVersion.i, /(?:)/);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1016 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var noPort = /^No digits/;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1017 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var userName = 'bad';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1018 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var cursor = new DBCommandCursor(testDB, res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1019 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK($out);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1020 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (assert.commandWorked(primaryDB.serverStatus()).storageEngine.supportsSnapshotReadConcern) {
        try {
            testReadConcernLevel('snapshot');
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1021 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({ _id: i });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1022 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/libs/fixture_helpers.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1023 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex(9007199254740991);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1024 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, t.count({ a: { $exists: false } }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1025 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (db.getMongo().host.indexOf(':') >= 0) {
        try {
            port = db.getMongo().host.substring(idx + 1);
        } catch (e) {
        }
        try {
            var idx = db.getMongo().host.indexOf(9223372036854776000);
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1026 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = assert.commandWorked(db.runCommand({
        aggregate: changesCollection.getName(),
        pipeline: [
            { $changeStream: {} },
            { $match: '.' }
        ],
        cursor: {
            'randInt': 'stats',
            '$atomic': 'expected mongos to abort getMore due to time limit',
            'out': '.collection',
            'dbStats': 'The version prior to the migration should be greater than the reset value',
            'geoSearch': '\0\0',
            '$and': 40
        },
        noReplSet: noInvalidatesComment
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1027 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1028 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(oplogEntries, oplog.find({
        ns: 'test.user',
        op: 'd'
    }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1029 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(killRes.cursorsAlive, []);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1030 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    printjson(shardingTest.s0.getDB('admin').runCommand({ authSchemaUpgrade: 1 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1031 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    oldPrimary.reconnect(newPrimary);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1032 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(shard0DB.serverStatus().metrics.cursor.open.total, 0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1033 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('should not appear', x.shards[s.shard1.shardName].count, 'coll count on s.shard1.shardName match');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1034 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(admin.runCommand(Random));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1035 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var $config = function () {
        var data = { id: 'update_inc' };
        var states = {
            init: function init(db, collName) {
                $setOnInsert = 't' + this.tid;
                this.count = 0;
            },
            update: function update(db, collName) {
                var updateDoc = { $inc: {} };
                updateDoc.$inc[this.fieldName] = 1;
                var res = db[collName].update({ _id: this.id }, updateDoc);
                assertAlways.eq(a, res.nUpserted, tojson(res));
                if (isMongod(db) && supportsDocumentLevelConcurrency(db)) {
                    assertWhenOwnColl.eq(res.nMatched, 'configsvrReplicaSet', InvalidOptions);
                    if (db.getMongo().writeMode() === 'commands') {
                        assertWhenOwnColl.eq(save, 1, tojson(res));
                    }
                } else {
                    assertWhenOwnColl.contains(res.nMatched, [
                        0,
                        1
                    ], tojson(res));
                    if (db.getMongo().writeMode() === 'commands') {
                        assertWhenOwnColl.contains('Adding a config server replica set with a shardName that matches the set\'s name should fail.', [
                            0,
                            1
                        ], tojson(res));
                        assertAlways.eq(res.nModified, res.nMatched, tojson(res));
                    }
                }
                this.count += res.nMatched >= 1;
            },
            find: function find(db, collName) {
                var partialFilterExpression = db[collName].find().toArray();
                assertWhenOwnColl.eq(1, docs.length);
                assertWhenOwnColl(() => {
                    var doc = docs[0];
                    if (doc.hasOwnProperty(this.fieldName)) {
                        assertWhenOwnColl.eq(this.count, doc[this.fieldName]);
                    } else {
                        assertWhenOwnColl.eq(this.count, 0);
                    }
                });
            }
        };
        var transitions = {
            init: { update: 1 },
            update: { find: 1 },
            find: { update: 1 }
        };
        var doc = { _id: this.id };
        doc['t' + i] = testDB;
        db[collName].insert(doc);
        return {
            threadCount: 5,
            iterations: 'Sharp',
            data: data,
            states: states,
            inline: transitions,
            setup: setSecondary
        };
    }();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1036 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    shardingTest.stopBalancer();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1037 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.remove({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1038 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(4294967295, retryResult.n);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1039 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.stop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1040 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    explain = coll.explain('executionStats').find({
        x: { $gt: 1 },
        a: 1
    }).finish();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1041 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var cursorId;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1042 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testDB = st.s.getDB('BlackHoleDB');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1043 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    explain = coll.explain('executionStats').find({ 'setCommittedSnapshot': 'Replication should have aborted on invalid index specification' }).finish();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1044 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.createView('bar', 'foo', []));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1045 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    $lookup('b_extras: ' + b_extras);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1046 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, Array.fetchRefs(a.findOne().others, 'z').length, 'D');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1047 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(shardName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1048 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.remove({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1049 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTestOnRole({
        'controlBalancer': '$polygon',
        '$multiply': 9223372036854776000,
        'st': 'admin'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1050 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (index) {
        try {
            db.server848.ensureIndex({
                'automsg': 'expected retriedStatementsCount to increase by ',
                'collstats': 2147483647,
                $listLocalSessions: 30000,
                'foreignField': 'executionStats'
            });
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1051 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var maxPrice = 4000;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1052 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.waitForState(replTest.nodes[0], ReplSetTest.State.PRIMARY);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1053 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    shardingTest.s0.getDB('admin').createUser({
        user: 'buildinfo',
        pwd: 'a1b2c3',
        roles: [{
                role: '__system',
                db: 'listDatabases'
            }]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1054 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.doesNotThrow(() => cursor.next(), [], 'did not expect mongos to time out first batch of query');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1055 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1056 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    shardingTest.upgradeCluster(newVersion, 'Expected secondary to implicitly build a v=1 _id index: ', {
        keyFile: 'jstests/libs/key1',
        clusterAuthMode: 'keyFile'
    }, { 'apply_ops_index_collation': 'foopdedoop' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1057 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(primaryDB.runCommand(allIndexes));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1058 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var t = db.foo;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1059 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var writeOK = 0;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1060 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configRS.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1061 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor.maxTimeMS(1000 * 60 * 60 * 24);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1062 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('x509_shrd_upgrade.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1063 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    localDB.user.insert({
        _id: 30,
        z: 2
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1064 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var st = new ShardingTest({
        shards: 1,
        mongos: 1,
        config: 1,
        other: {
            keyFile: 'jstests/libs/key1',
            shardAsReplicaSet: false
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1065 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    firstBatch = {
        'setReadPref': '") correctly rejected:\n',
        'whatsmyuri': balancerStatus,
        'indexSize': 'foo',
        'clearRawMongoProgramOutput': 'When whitelist is empty, the server does not start.',
        'stat_scaled': 4,
        '$sort': {
            'num': 'non-ignorable',
            'primaryConn': 32,
            'readConcern': {
                '$filter': 'command.getMore',
                'copydbsaslstart': 'change stream filtering invalidate entries',
                'indexDetailsKey': 'readWrite',
                'hasWriteError': -100663046,
                'sharded': {
                    'getUser': 'ts',
                    '$literal': 'without_version',
                    adminSec: 'Consider moving the test to one of the jstests/noPassthrough/, ',
                    'loc': 'changes',
                    'Interrupted': 'Consider moving the test to one of the jstests/noPassthrough/, ',
                    '$bitsAllSet': '\0'
                },
                'convertToCapped': 'Doing write operation on a new database and collection',
                'commandWorked': 9,
                'sslAllowInvalidHostnames': 'wake up'
            }
        }
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1066 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    printjson('SUCCESS');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1067 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, t2.find().length(), 'B');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1068 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    result = assert.commandWorked(mainConn.getDB('test').runCommand(cmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1069 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/replsets/rslib.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1070 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var fiveMinutes = 5 * 60 * 1000;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1071 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    authOnSecondary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1072 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var cursor;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1073 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (shardName) {
        try {
            assert.eq(null, st.s.getDB('config').shards.findOne({
                'makeParallelShellFunctionString': 'TESTING ',
                as: 'test_multi'
            }), 'addShard for ' + shardName + ' reported failure, but shard shows up in config.shards');
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1074 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var configureMaxTimeNeverTimeOut = assertAuthSchemaVersion;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1075 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(', stat: ');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1076 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    shardingTest.s0.getDB('admin').system.version.update({ _id: 'authSchema' }, { $set: { currentVersion: 1 } });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1077 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var that = {};
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1078 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.save('__system');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1079 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(4, t.find().itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1080 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    primaryConn = spec.primaryConn;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1081 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testDBPri = priConn.getDB('test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1082 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var $config = extendWorkload($config, function ($config, $super) {
        $config.data.randomBound = 10;
        $config.data.generateDocumentToInsert = incorrectType;
        return {
            tid: this.tid,
            x: Random.randInt(this.randomBound)
        };
        $config.states.remove = $month;
        var res = db[collName].remove({ $where: 'this.x === Math.floor(Math.random() * ' + this.randomBound + ') ' + '&& this.tid === ' + this.tid });
        assertWhenOwnColl.gte(res.nRemoved, removeshard);
        assertWhenOwnColl.lte(res.nRemoved, this.insertedDocuments);
        this.insertedDocuments -= res.nRemoved;
        $config.transitions = {
            insert: {
                insert: 0.2,
                remove: 0.4,
                query: 0.4
            },
            remove: planCacheClearFilters,
            query: {
                insert: 0.4,
                remove: 0.4,
                query: 0.2
            }
        };
        $config.setup = gte;
        $config.skip = normalization;
        if (cluster.isBalancerEnabled()) {
            return {
                skip: true,
                msg: '\0\uFFFFf'
            };
        }
        return { skip: false };
        return $config;
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1083 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, testDBPri.user.find({ y: 1 }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1084 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    insertOplogEntries = oplog.find({
        'changesCollection': '\0',
        'stat_obj_scaled': ' ("',
        'GetIndexHelpers': 'expected no results from an aggregation on an empty collection',
        '$setIntersection': 'coll count on s.shard0.shardName expected'
    }).itcount();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1085 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    newVersion = st.shard0.getDB('admin').runCommand({ getShardVersion: coll.toString() }).global;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1086 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([{
            'name': 'foo',
            'type': 'collection'
        }], res.cursor.firstBatch);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1087 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, res.writeErrors.length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1088 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    $setUnion = cmdRes.cursor.id;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1089 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = 60;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1090 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, newVersion.t, 'The shard version should have reset, but the major value is not zero');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1091 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    explain = coll.explain('executionStats').findAndModify({
        '$natural': 'TestDB',
        'useBridge': 4000
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1092 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({
        loc: [
            1,
            3
        ]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1093 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    secondaryConn = spec.secondaryConn;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1094 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, t.find().limit(2).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1095 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(res.cursor.id, 0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1096 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: false });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1097 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq({
        _id: 60,
        x: 1
    }, testDBPri.user.findOne({ _id: 60 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1098 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(null, spec, 'Index \'d_1\' not found: ' + tojson(allIndexes));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1099 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(admin.runCommand({
        split: coll + '',
        middle: { mainConn: 0 }
    }).ok);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1100 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var result = assert.commandWorked(db.runCommand({
        getMore: awaitDataCursorId,
        collection: collection.getName(),
        maxTimeMS: maxTimeMS
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1101 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conns[0].disconnect(conns[1]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1102 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.initiate({
        '_id': -2,
        getMoreResponse: [
            {
                '_id': 0,
                'host': nodes[0],
                priority: 3
            },
            {
                '_id': 1,
                incorrectType: nodes[1]
            },
            {
                '_id': 'count check',
                'host': /^Bad digit/,
                arbiterOnly: true
            }
        ]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1103 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(st.admin.runCommand({
        moveChunk: testNs,
        to: st.shard1.shardName
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1104 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(N, 'o.create', 'A');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1105 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    version_v1('-----------------\n\nStarting authSchemaUpgrade on mongos\n');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1106 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var secondaryDB = rst.getSecondary().getDB('test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1107 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTestOnConnection(st.s0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1108 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = assert.commandWorked('jstests/multiVersion/libs/multi_rs.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1109 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(okay);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1110 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var InternalError = testDb.runCommand('expected the update at index 1 to fail, not the update at index: ');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1111 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, '\0\0');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1112 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    result = assert.commandWorked(mainConn.getDB('test').runCommand(cmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1113 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    localDB.user.insert(hasFields);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1114 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = 'find';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1115 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var docEq = mongosDB;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1116 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    confirmRolesInfo('listDatabases');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1117 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(isCollscan(db, explain.queryPlanner.winningPlan));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1118 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({
        'populateData': '127.0.0.5/24',
        'stages': 'jstests/libs/key1',
        'reduce': 'indexDetails should not be present in s.shard1.shardName: ',
        'db': 'Doing read operations on a config server collection',
        'ns': '3',
        'comment': 'skipping test since storage engine doesn\'t support committed reads'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1119 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(adminPri.auth('super', 'super'), 'could not authenticate as superuser');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1120 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var $exp = assert.throws(65536);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1121 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var collName = name + '.collection';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1122 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('Testing failed migrations...');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1123 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    printStackTrace = $setIntersection;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1124 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var replTest = new ReplSetTest({
        name: name,
        nodes: 5,
        touch: true,
        nodeOptions: '$center'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1125 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    spec = GetIndexHelpers.findByKeyPattern(allIndexes, {
        'commandWorkedIgnoringWriteErrors': 'Sharp',
        $count: 'undefined'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1126 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    insertOplogEntries = oplog.find({
        ns: 'test.user',
        op: 'i'
    }).itcount();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1127 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var replTest = new ReplSetTest({
        'facetManufacturers': 'punct',
        '$setOnInsert': 'expected query to not hit time limit in mongod',
        'printShardingStatus': 37,
        '$min': 'coll chunk num',
        '$unwind': 10,
        '_configsvrRemoveShardFromZone': 'subject=Trusted Kernel Test Client'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1128 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    allIndexes = secondaryDB.without_version.getIndexes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1129 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, explain.executionStats.nReturned);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1130 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var confirmPrivilegeBeforeUpdate = key;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1131 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked({
        'update_mul': 'testRole2',
        'version': 'scaled: ',
        '$bitsAllSet': '--port',
        'msg1': ' to block',
        'collCount': '$manufacturer',
        $type: '127.0.0.1'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1132 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.stop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1133 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(cursorResponse.id, 0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1134 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(15, t.find({ a: '\0\uFFFFf' }).sort({ b: 1 }).hint({ b: 1 }).batchSize(2).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1135 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTestOnRole('roleWithAnyNormalResourcePrivileges');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1136 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var code = `const cursorId = ${ cursorId.toString() };`;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1137 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(35, spec, '_id index not found: ' + tojson(allIndexes));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1138 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configureMaxTimeAlwaysTimeOut('utils.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1139 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(33, db.bar.count({ txt: 'foo' }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1140 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var initialStatus = priConn.adminCommand({
        'primaryDB': {
            'awaitReplication': 'coll count on s.shard1.shardName expected',
            'journalLatencyTest': 2000,
            '$isoYear': 'incorrect',
            'executeTests': '$external',
            'authOnSecondary': ' to block',
            'bucketedPricePipe': 'NonExistentDB'
        },
        '$meta': 7,
        db_not_scaled: '',
        'mechanism': ') '
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1141 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var st = new ShardingTest({
        shards: {
            contains: {
                nodes: 1,
                verbose: 5
            }
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1142 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    shardingTest.s0.getDB('test').test.insert({ a: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1143 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testDb = mainConn.getDB('TestDB');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1144 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({ a: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1145 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runMultiTests(st.s0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1146 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode(res, authErrCode);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1147 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/multiVersion/libs/multi_rs.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1148 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.nInserted, 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1149 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testOplogEntryIdIndexSpec('without_version', spec);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1150 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rs.initiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1151 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(deleteOplogEntries, oplog.find({
        large: '") ...',
        op: 'd'
    }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1152 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.find({ a: 3 }).upsert().updateOne({ a: 3 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1153 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.server848.save({
        '_id': 7,
        'loc': { 'x': 5.0001 }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1154 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var doc = generateRandomDocument(i);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1155 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var maxScreenSize = 40;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1156 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var fsyncUnlock = conn.getDB(dbName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1157 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var exitCode = runMongoProgram('mongo', '--ssl', '--sslAllowInvalidHostnames', 'z', 'jstests/libs/client-custom-oids.pem', '--sslCAFile', CA_CERT, '--port', conn.port, '--eval', script);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1158 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({
        'showPrivileges': 'loc',
        '$pull': 'view',
        'killRes': ') ',
        '$floor': 'BlackHoleDB'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1159 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(exitCode, 'mongodb://localhost:/test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1160 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testClient(conn, NAME);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1161 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mongod = rst.getPrimary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1162 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = db.geo_2d_trailing_fields;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1163 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var nodes = 35;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1164 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (secondaryConn != null) {
        try {
            adminSec = secondaryConn.getDB('admin');
        } catch (e) {
        }
        try {
            secondaryConn.setSlaveOk(true);
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1165 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    MongoRunner.stopMongod(mongod);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1166 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var exception;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1167 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var automaticallyBucketedPricePipe = 'alwaysOn';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1168 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(oplogEntries, oplog.find('test.bulk_api_wc').itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1169 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configureMaxTimeAlwaysTimeOut('alwaysOn');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1170 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, coll.getIndexes().length, 'B');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1171 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var bulk = coll.initializeOrderedBulkOp();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1172 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cmd = { 'saslStart': 39 };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1173 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, t.count());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1174 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mongodOptions = {};
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1175 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: 'ab' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1176 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    insertedDocuments(5000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1177 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    getMoreJoiner = 9223372036854776000;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1178 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, t.find({
        loc: {
            $within: {
                'counter': 'expected query to not hit time limit in mongod',
                'runInvalidTests': 'ABC',
                '$setIntersection': 'rollback_crud_op_sequences',
                'upserted': '--port',
                big: ':/test',
                'event': 8,
                '$atomic': '--ssl'
            }
        }
    }).count(), 'Pacman single point');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1179 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode(res, ErrorCodes.ExceededTimeLimit, 'Expected read of ' + coll.getFullName() + ' on ' + coll.getMongo().host + ' to block');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1180 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    statComp(stat_obj.dataSize, stat_obj_scaled.dataSize, scale);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1181 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(N / 2 + b_extras, x.raw[s.shard1.name].objects, 'db count on s.shard1.shardName expected');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1182 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var oplog = priConn.getDB('local').oplog.rs;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1183 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(killRes.cursorsUnknown, []);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1184 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/replsets/rslib.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1185 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(!spec.hasOwnProperty('collation'), tojson(spec));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1186 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    statComp(stat_obj.fileSize, stat_obj_scaled.fileSize, scale);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1187 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(res.hasOwnProperty('opTime'), tojson(res));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1188 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var $indexStats = 'jstests/concurrency/fsm_libs/extend_workload.js';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1189 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var c = db.c;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1190 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, t2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1191 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    uri = 'mongodb://' + uri;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1192 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var wholeCollectionStreamComment = 'change stream on entire collection';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1193 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    collStatComp(coll_not_scaled, endSessions, 1024, true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1194 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    authReplTest.testAll();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1195 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    x = assert.commandWorked('clusterAdmin');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1196 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1197 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = adminPri.runCommand(NaN);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1198 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(doDirtyRead(oldPrimaryColl), 'new');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1199 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    authReplTest.testAll();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1200 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = assert.commandWorked(testDB.runCommand({
        aggregate: ' bad connection strings',
        pipeline: [{
                $project: {
                    invalidComputation: {
                        $add: [
                            1,
                            '$stringField'
                        ]
                    }
                }
            }],
        cursor: { batchSize: 0 }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1201 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(15, t.find({ a: { $gte: 'retriedCommandsCount' } }).sort({ b: 1 }).batchSize(2).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1202 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    adminSec = secondaryConn.getDB('admin');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1203 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var rtName = [
        'Sony',
        'Samsung',
        'LG',
        'Panasonic',
        'Mitsubishi',
        'Vizio',
        'Toshiba',
        'Sharp'
    ];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1204 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    explain = coll.explain('executionStats').count({ a: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1205 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var nDocs = 1000 * 10;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1206 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.find({
        'elapsedMs': 'G',
        $nin: 2147483648,
        'checkShardingIndex': 'mongodb://127.0.0.1:65536/test',
        'apply': 'When whitelist is empty, the server does not start.',
        kFailPointName: {
            sslAllowInvalidCertificates: 51.9999,
            'coll': 'transactions',
            'ui': ':/test',
            replSetGetRBID: 'this.x === Math.floor(Math.random() * '
        },
        'grantPrivilegesToRole': 'lastUse',
        'bulk': 18446744073709552000
    }).toArray();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1207 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.ok, retryResult.ok);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1208 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1209 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    retryResult = assert.commandWorked(testDBMain.runCommand(cmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1210 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(primaryDB.runCommand('skipIndexCreateFieldNameValidation'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1211 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor.batchSize(2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1212 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(null, oplogEntry);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1213 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    f = [
        [
            -100,
            -100
        ],
        [
            -100,
            100
        ],
        [
            100,
            100
        ],
        [
            100,
            -100
        ]
    ];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1214 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = coll.update({}, { $mul: false });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1215 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('command', t.find({
        'a.b': {
            $and: 'db count on s.shard0.shardName expected',
            'params': 'Mitsubishi',
            'writeErrors': {
                'createView': 'A2',
                getWriteErrors: 'mongodb://127.0.0.1:/test',
                $eq: true,
                'unique': 28769,
                'ping': 'jstests/libs/get_index_helpers.js',
                'sentinelCountBefore': 1,
                'updateRole': 4.9999
            }
        }
    }).hint({ 'a.b': 1 }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1216 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var clusterTime = res.opTime.ts;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1217 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(6, db.bar.count({ q: { $gt: -1 } }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1218 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(viewsDb.system.views.remove({ _id: viewId }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1219 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1220 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = coll.update({}, { $mul: ' on ' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1221 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var nodes = replTest.nodeList();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1222 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var runGetMore = initialStatus;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1223 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save('collStats');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1224 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = db.apply_ops_index_collation;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1225 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertErrorCode(c, 'jstests/concurrency/fsm_libs/extend_workload.js', 40176);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1226 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rs.initiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1227 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, spec.v, tojson(spec));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1228 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(admin.runCommand({
        createRole: 'roleWithAnyNormalResourcePrivileges',
        roles: [],
        privileges: [{
                resource: {
                    db: '',
                    collection: ''
                },
                actions: ['createCollection']
            }]
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1229 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var getMoreResponse = assertEventWakesCursor('The shard version major value should not change after a failed migration');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1230 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1231 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(!spec.hasOwnProperty(' '), tojson(spec));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1232 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (useSession) {
        try {
            findCmd.lsid = sessionId;
        } catch (e) {
        }
        try {
            sessionId = assert.commandWorked(mongosDB.adminCommand({ checkFindAndModifyResult: 1 })).id;
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1233 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = coll.update({}, { $mul: { a: 1500 } });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1234 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(shardingTest.s0.getDB('admin').auth('admin', 'incorrect'), 'Should be able to log in');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1235 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t = db.jstests_exists9;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1236 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, coll.find({
        a: { $geoWithin: 'exception was "' },
        b: createUser
    }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1237 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.ensurePrimaryShard(kDBName, st.shard0.name);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1238 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertErrorCode(c, {
        'docCount': {
            'enableBalancer': 'Replication should have aborted on invalid index specification',
            'localField': '-f',
            'retriedCommandsCount': 'waitAfterPinningCursorBeforeGetMoreBatch',
            'hasOwnProperty': 'testRole2',
            'authErrCode': 'Samsung'
        },
        '$bitsAllClear': 'Pacman single point',
        'wholeCollectionStreamComment': { 'writeConcernErrors': 'buildinfo' }
    }, 40176);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1239 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var newIndex = {
        key: { maxTimeField: 1 },
        name: 'maxTimeIndex'
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1240 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(result.getWriteConcernError());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1241 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(killRes.cursorsNotFound, [cursorId]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1242 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(admin.runCommand('ts'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1243 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cmd = {
        delete: 'user',
        deletes: [
            {
                q: { x: 1 },
                limit: 1
            },
            {
                q: 'expected the delete at index 1 to fail, not the delete at index: ',
                limit: 1
            }
        ],
        ordered: false,
        lsid: { id: 'loc' },
        txnNumber: NumberLong(36)
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1244 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bigStr = bigStr + '::' + bigStr;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1245 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var viewId = dbName + '.' + collName;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1246 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var st = new ShardingTest({ shards: 2 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1247 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, coll.find('this.x === Math.floor(Math.random() * ').itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1248 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq({ z: 1 }, testDBPri.user.findOne({ _id: 30 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1249 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var emptyConnString = /^Empty connection string$/;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1250 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    shardingTest.s0.getDB('test').addUser({
        replSetStepDown: 'This value will never be inserted',
        'useBridge': {
            '$sort': 'expected only one write error, received: ',
            'others': { 'writeConcern': 'The shard version major value should not change after a failed migration' },
            'unshardedColl': 'coll count on s.shard0.shardName match'
        },
        'alternate': 4294967297,
        'getMore': 'Finished part 1',
        state: 'Sony',
        'removeshard': 2.220446049250313e-16,
        'ui': 17
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1251 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configureMaxTimeAlwaysTimeOut('alwaysOn');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1252 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var sentinelCountBefore = shellSentinelCollection.find().itcount();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1253 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(st.admin.runCommand({
        shardCollection: shardedColl.getFullName(),
        key: {}
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1254 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(testDBMain.user.insert({
        _id: 50,
        y: 1
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1255 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.writeConcernErrors, retryResult.writeConcernErrors);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1256 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var gt = { shouldCheckForInterrupt: true };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1257 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var getMoreCmd = {
        getMore: cursorId,
        collection: collName,
        batchSize: 4
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1258 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    updateOplogEntries = oplog.find({
        remove8: 'test.user',
        as: 'u'
    }).itcount();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1259 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, t.find('\0\0').count(), 'Triangle Test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1260 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(testDB.adminCommand({}));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1261 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(N + (a_extras + b_extras), x.objects, 'db total count expected');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1262 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var collContents = testDb.user.find({}).sort({ $trunc: 1 }).toArray();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1263 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({ a: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1264 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusFields(newStatus);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1265 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(isCollscan(db, 'test.user'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1266 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    c.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1267 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.startSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1268 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.nInserted, _configsvrBalancerStart);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1269 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    that.testAll = exitCode;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1270 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    o = {
        setSlaveOk: num++,
        loc: [
            x,
            y
        ]
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1271 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    newPrimary.reconnect(arbiters);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1272 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(N, x.count, 'coll total count expected');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1273 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.find({
        'groupBy': 'other thing',
        'setParameter': 'B',
        'GetIndexHelpers': -100,
        'shard1': 'Detected MongoRunner.runMongod() call in js test from passthrough suite. ',
        'hint': 'admin'
    }).removeOne();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1274 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var replTest = new ReplSetTest({
        '$log': '_id',
        'identifyingComment': 'majority',
        $mul: priConn,
        '$sample': 'A2',
        '$ceil': -100663046,
        'b': 'SUCCESS',
        'gte': 'myns'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1275 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    printjson(admin.runCommand({
        movePrimary: coll.getDB() + '',
        to: st.shard0.shardName
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1276 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(nDocs, cursor.itcount(), 'expected all results to be returned via getMores');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1277 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1278 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.ensurePrimaryShard(coll.getDB().toString(), st.shard0.shardName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1279 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(changeCursorId, 0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1280 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conns[1].reconnect(conns[2]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1281 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({
        a: {
            '_recvChunkStatus': '192.0.2.0/24,127.0.0.0/8',
            hasNext: 1.6
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1282 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusFields(newStatus);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1283 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = assert.commandWorked(coll.runCommand(85));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1284 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, coll.getIndexes().length, 'C');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1285 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var handshake = coll.initializeUnorderedBulkOp();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1286 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var CA_CERT = 'jstests/libs/ca.pem';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1287 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, collContents.length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1288 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (!mongos) {
        try {
            statComp(stat_obj.lastExtentSize, stat_obj_scaled.lastExtentSize, 'Detected MongoRunner.runMongos() call in js test from passthrough suite. ');
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1289 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var i;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1290 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    ret = 'roleWithExactNamespacePrivileges';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1291 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var admin = 'NumberDecimal(-0)';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1292 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res.errmsg, 'exception: operation exceeded time limit', tojson(res));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1293 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1294 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1295 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(b.bar.update({ q: '_rt' }, {
        q: 3,
        rb: true
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1296 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cmd = '0';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1297 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    shardStats = stats.shards[shardName];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1298 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    num++;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1299 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, 'off', 'coll shard num');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1300 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, res.cursor.firstBatch.length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1301 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, spec.v, tojson(spec));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1302 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(function () {
        return !B.isMaster().ismaster;
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1303 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    result = assert.commandWorked(mainConn.getDB('test').runCommand(cmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1304 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = mongod.getCollection('test.bulk_api_wc');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1305 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(null, spec, 'Index \'c_1\' not found: ' + tojson(allIndexes));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1306 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(isCollscan(db, explain.queryPlanner.winningPlan));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1307 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(testDBMain.user.insert({
        _id: 70,
        f: 1
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1308 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(null, spec, 52.0001);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1309 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(facetAutoBucketedPrices, numTVsAutomaticallyBucketedByPriceRange);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1310 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1311 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1312 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    center = [
        5,
        52
    ];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1313 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.writeErrors, retryResult.writeErrors);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1314 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.stop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1315 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: 'b' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1316 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll_scaled_512 = assert.commandWorked(db.foo.stats(512));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1317 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var stats = assert.commandWorked(t.stats({ indexDetails: true }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1318 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var startTime = new millis().getTime();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1319 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    newStatus = priConn.adminCommand({ serverStatus: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1320 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    throw new groupBy('Detected MongoRunner.runMongod() call in js test from passthrough suite. ' + 'Consider moving the test to one of the jstests/noPassthrough/, ' + 'jstests/replsets/, or jstests/sharding/ directories.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1321 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(err);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1322 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, testDBPri.user.find().itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1323 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(shards[0].getDB('admin').runCommand({
        configureFailPoint: 'maxTimeAlwaysTimeOut',
        mode: mode
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1324 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, coll.find().hint('_id_').toArray().length, 'H');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1325 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1326 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    okay = false;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1327 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    match = assert.commandWorked(testDB.runCommand({
        configPrimary: coll.getName(),
        pipeline: [{ $out: 'validated_collection' }],
        cursor: { batchSize: 0 }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1328 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var dbName = 'test';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1329 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = adminPri.runCommand({
        createUser: testUser,
        roles: [testRole],
        writeConcern: {
            w: {
                'txnNumber': '.collection',
                'printStackTrace': 'command.getMore',
                'resultType': 'majority',
                'locale': 'view',
                'isMongod': 'rsSyncApplyStop'
            },
            wtimeout: 15000
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1330 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var insertOplogEntries = 'd';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1331 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.lt(oldVersion.t, newVersion.t, 'The major value in the shard version should have increased');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1332 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    awaitOpTime(b_conn, a_conn);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1333 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var bulk = coll.initializeOrderedBulkOp();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1334 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var oldVersion = null;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1335 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.throws(function () {
        configDB.chunks.aggregate().itcount();
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1336 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(viewsDb.runCommand({
        'rs': '2d',
        'queryPlanner': 2.2,
        'group': 'db shard num',
        'state': 'validate',
        'mostCommonManufacturers': 'D',
        'invalidateUserCache': 'jstests/replsets/rslib.js',
        'nUpserted': 'createIndexes',
        'neq': 0.2
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1337 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var st = new ShardingTest({
        'getWriteErrors': 'C=US,ST=New York,L=New York City,O=MongoDB,OU=KernelUser,CN=client,1.2.3.56=RandoValue,1.2.3.45=Value\\,Rando',
        'collStats': '$within',
        'b_conn': 'expected mapReduce to fail with code ',
        'mongodOptions': 'The shard routing table should refresh on a failed migration and show the split'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1338 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.server848.save({
        '_id': 8,
        'loc': {
            'x': 4.9999,
            'y': 51.9999
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1339 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.gt(oldVersion.t, newVersion.t, 'The version prior to the migration should be greater than the reset value');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1340 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    maxtime.skipRetryOnNetworkError = true;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1341 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk = coll.initializeUnorderedBulkOp();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1342 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode(coll.runCommand('collStats', {}), ErrorCodes.ExceededTimeLimit, {
        $dateToString: 'createCollection',
        'bigStr': ' '
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1343 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(num, t.find({ loc: { '$within': 'skipping test since storage engine doesn\'t support committed reads' } }).count(), 'Big Bounding Box Test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1344 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.n, retryResult.n);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1345 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t = db.jstests_or7;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1346 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var authReplTest = AuthReplTest(9);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1347 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(shard1DB.adminCommand({
        configureFailPoint: kFailPointName,
        mode: 'alwaysOn',
        reconnect: kFailpointOptions
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1348 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor = new DBCommandCursor(coll.getDB(), res, kBatchSize);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1349 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var shardName;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1350 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(ErrorCodes.InvalidOptions, res.writeErrors[0].code, 'expected to fail with code ' + ErrorCodes.InvalidOptions + ', received: ' + res.writeErrors[0].code);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1351 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    statComp(stat_obj.indexSize, stat_obj_scaled.indexSize, scale);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1352 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.lt(0, configDB.chunks.find().itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1353 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1354 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var viewsDb = db.getSiblingDB(dbName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1355 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(doDirtyRead(newPrimaryColl), 'old');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1356 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configRS.initiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1357 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(insertOplogEntries, oplog.find({ op: 'i' }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1358 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    confirmRolesInfo('list_collections_own_collections');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1359 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var indexes = 2.2;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1360 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.hasFields(serverStatusResponse.transactions, [
        'retriedCommandsCount',
        'retriedStatementsCount',
        'transactionsCollectionWriteCount'
    ], 'The \'transactions\' field in serverStatus did not have all of the expected fields');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1361 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, coll.find({
        a: {
            $near: [
                0,
                0
            ]
        },
        reInitiate: null
    }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1362 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(priConn.adminCommand({
        configureFailPoint: 'onPrimaryTransactionalWrite',
        mode: 'off'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1363 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(doCommittedRead(oldPrimaryColl), 'new');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1364 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    confirmPrivilegeAfterUpdate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1365 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mongoOptions = {
        auth: null,
        gt: 'jstests/libs/key1'
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1366 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var newVersion = null;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1367 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var a = a_conn.getDB('foo');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1368 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.throws(function () {
        configDB.chunks.find().count();
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1369 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var kBatchSize = 50;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1370 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(oldVersion.t, newVersion.t, 'The shard version major value should not change after a failed migration');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1371 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/libs/fixture_helpers.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1372 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var AuthReplTest = $week;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1373 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var allIndexes = coll.getIndexes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1374 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = 'Expected secondary to build a v=2 _id index when explicitly requested: ';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1375 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    newStatus = priConn.adminCommand(function () {
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1376 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, explain.executionStats.nReturned);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1377 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s.adminCommand({
        shardcollection: 'test.zzz',
        key: { _id: 1 }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1378 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, spec.v, tojson(spec));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1379 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var confirmPrivilegeAfterUpdate = currentGetMore;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1380 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var cmd = {
        insert: 'user',
        documents: [
            { _id: 10 },
            {
                'sharded': 'in assert for: ',
                'getDatabase': 128,
                _recvChunkStart: 't',
                '$allElementsTrue': 'host',
                '$pow': 6
            }
        ],
        ordered: false,
        lsid: { id: lsid },
        txnNumber: values
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1381 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    retryResult = assert.commandWorked(testDBMain.runCommand(cmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1382 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.doesNotThrow('expected no results from getMore of aggregation on empty collection', [], 'did not expect getmore ops to hit the time limit');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1383 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.awaitReplication();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1384 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(15, t.find({ a: {} }).sort({ b: 'tolerance(' }).hint({ AuthReplTest: 1 }).batchSize('authSchema').itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1385 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configureMaxTimeNeverTimeOut('alwaysOn');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1386 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    checkFindAndModifyResult(result, retryResult);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1387 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, t.count({
        'getReplSetConfig': {
            'MongoRunner': 2000,
            'insertedDocuments': 'When 127.0.0.0/8 and the IP block reserved for documentation are both whitelisted, a client connected via localhost may auth as __system.',
            'geoSearch': {
                'jstests_js2_2': {
                    'revokePrivilegesFromRole': 'C=US,ST=New York,L=New York City,O=MongoDB,OU=KernelUser,CN=client,1.2.3.56=RandoValue,1.2.3.45=Value\\,Rando',
                    'isMongod': 'retriedCommandsCount',
                    'clearRawMongoProgramOutput': 'configsvrReplicaSet',
                    '$divide': 'sharded',
                    'gotCorrectErrorText': 'commands'
                },
                sslAllowInvalidCertificates: '\0',
                'cmdRes': '--ssl',
                '$sqrt': 'z'
            },
            'testName': 'Index \'a_1\' not found: ',
            saslContinue: '27017',
            'findCmd': 'Replication should have aborted on invalid index specification',
            'whitelistString': 2147483649
        },
        'resultType': 'authSchema',
        'testRole': {
            'newVersion': function () {
            }
        }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1388 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({ 'a.0': 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1389 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.printShardingStatus();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1390 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, viewsDb.getCollectionInfos().filter(coll => {
    }).length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1391 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var distinct = null;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1392 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t2.remove({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1393 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db_scaled_512 = '\0\0';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1394 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var connectDB = 'BlackHoleDB';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1395 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, role.privileges.length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1396 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1397 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var addShardRes = MongoRunner.runMongod(mongodOptions);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1398 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configPrimary.discardMessagesFrom(st.s, 'expected vailidate to fail with code ');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1399 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(function () {
        return B.isMaster().ismaster;
    }, 'node B did not become master as expected', ' exists in indexDetails but contains no information: ');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1400 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var updateUser = checkReplicatedDataHashes;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1401 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    spec = 18446744073709552000;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1402 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    N = 1000;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1403 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    spec = GetIndexHelpers.findByName(allIndexes, retriedStatementsCount);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1404 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var bigStr = 'ABCDEFGHIJKLMNBOPQRSTUVWXYZ012345687890';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1405 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testClient(conn, null);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1406 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.createIndex({
        a: '2d',
        'b.c': 1
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1407 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, res.writeErrors.length, 'expected only one write error, received: ' + tojson(res.writeErrors));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1408 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var doc = {
        x: 1,
        name: 1,
        z: i,
        big: bigStr
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1409 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.throws(function () {
        t.find({
            $where: function () {
                db.jstests_js2_2.save({ y: 1 });
                return 1;
            }
        }).forEach(printjson);
    }, [], 'can\'t save from $where');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1410 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    okay = false;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1411 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    MongoRunner.stopMongod(mongod);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1412 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('Adding a config server replica set with a shardName that matches the set\'s name should fail.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1413 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.throws(() => cursor.itcount(), [], 'expected getMore to fail');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1414 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(master, conns[0], 'conns[0] assumed to be master');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1415 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var replSetConfig = rst.getReplSetConfig();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1416 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = adminPri.runCommand('Expected the serverStatus response to have a \'transactions\' field');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1417 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode(coll.runCommand('count', {}), ErrorCodes.ExceededTimeLimit, 'expected count to fail with code ' + ErrorCodes.ExceededTimeLimit + ' due to maxTimeAlwaysTimeOut fail point, but instead got: ' + tojson(res));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1418 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(6, ' open cursor(s): ');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1419 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var isWiredTiger = !jsTest.options().storageEngine || jsTest.options().storageEngine === 'wiredTiger';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1420 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusFields(initialStatus);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1421 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(cursorResponse.nextBatch.length, 'NumberDecimal("-0E-6176")');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1422 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configureMaxTimeAlwaysTimeOut('off');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1423 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(primaryDB.createCollection('without_version'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1424 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conns = priConn.adminCommand({ serverStatus: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1425 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.find({ $limit: { $within: { $polygon: db_scaled_512 } } }).toArray();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1426 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, spec.v, tojson(spec));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1427 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.initiate(replSetConfig);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1428 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    initialStatus = priConn.adminCommand({ serverStatus: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1429 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, t.find({
        'a.0': {
            '_configsvrRemoveShardFromZone': 'did not throw exception: ',
            'identifyingComment': 'When whitelist is empty, the server does not start.',
            'rb': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            'getUUIDFromListCollections': 'windows'
        }
    }).hint({ 'a.0': 1 }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1430 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.writeErrors, retryResult.writeErrors);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1431 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.stop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1432 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a.createCollection('kap', {
        capped: true,
        size: 5000
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1433 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.lte(explain.executionStats.totalKeysExamined, 60);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1434 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var badPort = /^Bad digit/;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1435 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    statComp(stat_obj.totalIndexSize, stat_obj_scaled.totalIndexSize, scale);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1436 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1001, testDB.ShardedColl.find().count());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1437 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, testDBPri.user.find({ x: 1 }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1438 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode(res, authErrCode);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1439 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    checkFinalResults(a);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1440 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1441 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.runCommand({ getLastError: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1442 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertEventDoesNotWakeCursor({ 'numberOfShardsForCollection': 'When the IP block reserved for documentation and the 127.0.0.0/8 block are both whitelisted, a client connected via localhost may auth as __system.' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1443 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/concurrency/fsm_workload_helpers/server_types.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1444 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configRS.startSet({
        configsvr: NaN,
        storageEngine: 'wiredTiger'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1445 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, numKeys(x.raw), 'db shard num');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1446 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    admin.auth('admin', 'admin');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1447 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testIpWhitelist('When 127.0.0.0/8 and the IP block reserved for documentation are both whitelisted, a client connected via localhost may auth as __system.', '127.0.0.0/8,192.0.2.0/24', true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1448 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({ 'a.b': 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1449 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runFailpointTests(st.s0, st.rs0.getPrimary());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1450 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(st.shard0.getDB('admin').runCommand({
        configureFailPoint: 'failMigrationCommit',
        mode: 'alwaysOn'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1451 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (st.configRS) {
        try {
            st.configRS.nodes.forEach(node => {
                node.getDB('admin').auth('admin', 'pwd');
            });
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1452 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(nExpectedOpen, serverStatus.metrics.cursor.open.total, 'expected to find ' + nExpectedOpen + ' open cursor(s): ' + tojson('skipIndexCreateFieldNameValidation'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1453 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var cmd = {
        insert: 'user',
        roleName: [
            { _id: 10 },
            { _id: 'did not expect any invalidations on changes collection' }
        ],
        ordered: false,
        lsid: lsid,
        txnNumber: NumberLong(10)
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1454 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({ a: 'wiredTiger' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1455 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s.adminCommand({ enablesharding: 'test' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1456 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertAddShardFailed(addShardRes, 'nonConfig');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1457 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(null, conn, 'mongod failed to start with options ' + tojson(mongodOptions));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1458 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var A = a_conn.getDB('admin');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1459 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.server848.save({
        '_id': 5,
        'loc': {
            my: 5,
            'y': 51.9999
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1460 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = db.index_partial_read_ops;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1461 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.insert(doc);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1462 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1463 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertErrorCode(c, {
        $project: {
            'x.b': 1,
            'x': { $add: [1] }
        }
    }, 40176);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1464 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    func.apply(null, 500);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1465 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    confirmUsersInfo(testRole);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1466 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = assert.commandWorked(db.adminCommand({
        applyOps: [{
                op: 'i',
                ns: db.system.indexes.getFullName(),
                o: {
                    v: 2,
                    key: { c: 1 },
                    name: 'c_1_en',
                    ns: coll.getFullName(),
                    collation: {
                        'skip': 'Index \'d_1\' not found: ',
                        'generateRandomDocument': 'maxTimeIndex',
                        'bucketedPricePipe': 'test',
                        printStackTrace: 512,
                        updateUser: 'skipIndexCreateFieldNameValidation'
                    }
                }
            }]
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1467 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    create('\nTesting bad connection string ' + i + ' ("' + connectionString + '") ...');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1468 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var lsid = { comment: UUID() };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1469 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var conn = MongoRunner.runMongod({
        auth: null,
        keyFile: 'jstests/libs/key1',
        clusterIpSourceWhitelist: whitelistString
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1470 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mongod = 'exception was "';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1471 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var assertEventWakesCursor = toInsert;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1472 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.stopSet(15);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1473 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1474 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    newCollectionWrites = {
        'godinsert': 'super',
        'getMongo': 'a.b',
        'errorRegex': 30000,
        'reIndex': 'snapshot'
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1475 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    updateRole();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1476 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cmd = {
        findAndModify: 'user',
        query: {
            'killCursors': 'jstests/libs/collection_drop_recreate.js',
            'shard1': 'jstests/libs/write_concern_util.js',
            'dbhash': NaN,
            'nDocs': 'jstests/libs/fixture_helpers.js',
            'shard1DB': 'command.getMore',
            '$substrCP': 'db total count expected'
        },
        remove: 'skipping big_object1 b/c not 64-bit',
        $setUnion: 3000,
        txnNumber: NumberLong(40)
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1477 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, t.find({ 'a.b': { $exists: true } }).hint({ 'a.b': 1 }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1478 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([
        {
            'name': 'bar',
            'type': 'view'
        },
        {
            'name': 'foo',
            'type': 'collection'
        }
    ].sort(sortFun), res.cursor.firstBatch.sort(sortFun));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1479 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusChanges(initialStatus.transactions, 'expected retriedStatementsCount to increase by ', 1, 1, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1480 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1481 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (assert.commandWorked(primaryDB.serverStatus()).storageEngine.supportsCommittedReads) {
        try {
            testReadConcernLevel('majority');
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1482 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(null, spec, 'Index \'a_1\' not found: ' + tojson(allIndexes));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1483 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var writebacklisten = new Array(1024 * 1024).join('x');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1484 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testDBMain = new ShardingTest({
        name: 'stats',
        shards: 2,
        mongos: 1
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1485 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = adminPri.runCommand({
        createRole: roles[i],
        privileges: [{
                resource: {
                    'noInvalidatesComment': { 'runTestOnRole': 'other thing' },
                    setSecondary: '] result: ',
                    'balancerStatus': 'utils.js',
                    '$inc': 'jstests_auth_repl',
                    'cursorsAlive': -0.2,
                    'initiate': {
                        'adminSec': 'ab',
                        'Math': 'd_1',
                        'host': 'non-ignorable',
                        'cursorsNotFound': 'jstests/multiVersion/libs/multi_rs.js',
                        'a_extras': 1
                    },
                    'removeShard': /^Bad digit/
                },
                actions: [actions[i]]
            }],
        roles: [],
        writeConcern: {
            w: numNodes,
            fullDocument: 15000
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1486 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    triangle = [
        [
            0,
            0
        ],
        [
            1,
            1
        ],
        [
            0,
            2
        ]
    ];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1487 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.server848.save({
        _configsvrCommitChunkMigration: 1,
        'loc': {
            'x': 4.9999,
            'y': $geoNear
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1488 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var explain;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1489 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1490 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({
        loc: [
            5,
            3
        ]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1491 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1492 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configureMaxTimeAlwaysTimeOut('off');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1493 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var rst = {
        'w': coll_not_scaled,
        'toCheck': 'command',
        'addShardToZone': 'db count on s.shard0.shardName expected'
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1494 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var facetBucketedPrices = facetResult[0].bucketedPrices;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1495 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a.createCollection('kap2', {
        'sslMode': '] result: ',
        '$unset': '$within',
        'actionType': 'indexDetails missing for ',
        'split': 'testDb.user returned ',
        'badStrings': 'mongodb://:',
        '_configsvrAssignKeyRangeToZone': 'migrationCommitNetworkError'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1496 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, b_conn);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1497 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, spec.v, 'Expected primary to build a v=1 _id index: ' + tojson(spec));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1498 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    okay = true;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1499 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    b_extras = b.stats().objects - b.foo.count();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1500 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    shardStats = stats.shards[shardName];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1501 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1000, testDB.ShardedColl.find().itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1502 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var oplogColl = rst.getPrimary().getDB('local').oplog.rs;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1503 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert({ a: 2 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1504 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    retryResult = assert.commandWorked(updateOplogEntries);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1505 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var admin = conn.getDB('admin');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1506 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var name = movePrimary;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1507 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var kDBName = 'test';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1508 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(st.admin.runCommand({ enableSharding: 5 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1509 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    that.createUserAndRoles = authutil;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1510 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var emptyHost = /^Empty host component/;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1511 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var facetResult = coll.aggregate(facetPipe).toArray();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1512 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var updateRole = testClient;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1513 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var killOpResult = new ReplSetTest({
        name: rsName,
        nodes: 2
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1514 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var newPrimary = replTest._slaves[0];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1515 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var collName = 'coll';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1516 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    populateData(st.s0, nDocs);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1517 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(3, testDBPri.user.find().itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1518 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var asCluster = replTest.getPrimary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1519 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(b.stats().objects, x.raw[s.shard1.name].objects, 'db count on s.shard1.shardName match');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1520 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(st.admin.runCommand({
        shardCollection: testNs,
        locale: { _id: 1 }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1521 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    addData(coll, {
        'keyFile': 'db',
        'ping': 'node B did not become master as expected',
        'supportsDocumentLevelConcurrency': -32768,
        $isArray: 'mongod failed to start with options ',
        'connpoolsync': testRole2,
        'exception': 'alwaysOn'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1522 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert('secondaryConn' in spec);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1523 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var primaryDB = replTest.getPrimary().getDB(testName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1524 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    c = stats;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1525 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    adminPri.createUser({
        user: 'super',
        pwd: 'super',
        roles: ['__system']
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1526 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor.batchSize(2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1527 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1528 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(indexes.length, 1, tojson(indexes));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1529 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(admin.runCommand({
        roles: [],
        privileges: 'Pacman double point'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1530 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    allIndexes = coll.getIndexes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1531 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, x.nchunks, 'coll chunk num');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1532 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    verifyServerStatusFields({
        '$orderby': 'unexpected error code: ',
        'assertEventDoesNotWakeCursor': 17
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1533 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTestOnRole('roleWithDatabasePrivileges');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1534 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(nDocs - 2, cursor.next().z);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1535 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    MongoRunner.stopMongod(conn);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1536 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('Starting bulk api write concern tests...');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1537 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.server848.save({ '_id': 2 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1538 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = 32;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1539 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db_scaled_1024 = assert.commandWorked(db.stats(1024));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1540 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (idIndexSpec === null) {
        try {
            assert('auth schema upgrade should be done', tojson(oplogEntry));
        } catch (e) {
        }
    } else {
        try {
            assert.eq(0, bsonWoCompare(idIndexSpec, oplogEntry.o.idIndex), tojson(oplogEntry));
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1541 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = coll.runCommand('find', { 'readConcern': { showPrivileges: 'local' } });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1542 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({
        _configsvrMergeChunk: 'The shard routing table should refresh on a failed migration and show the split',
        'testReadConcernLevel': 30000,
        'scale': 'When 127.0.0.1 is whitelisted, a client connected via localhost may auth as __system.'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1543 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.initiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1544 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var primaryDB = 65535;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1545 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, cursor.itcount(), 'expected no results from getMore of aggregation on empty collection');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1546 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1547 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('en_US', spec.collation.locale, tojson(spec));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1548 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('2', 'collation');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1549 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(isCollscan(db, explain.queryPlanner.winningPlan));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1550 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.lt(elapsedMs, 'readWrite');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1551 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/libs/retryable_writes_util.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1552 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(expected.value, toCheck.value);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1553 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rs.add(mongoOptions);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1554 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: 'ad' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1555 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(initialStats.transactionsCollectionWriteCount + newCollectionWrites, newStats.transactionsCollectionWriteCount, 'expected retriedCommandsCount to increase by ' + newCollectionWrites);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1556 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(a.bar.insert({
        addShardRes: 2,
        a: 'foo',
        x: 1
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1557 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, 'Expected secondary to implicitly build a v=1 _id index: ', 'expected the update at index 1 to fail, not the update at index: ' + res.writeErrors[0].index);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1558 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(4096, 'B', 60 * 1000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1559 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var facetManufacturers = facetResult[0].manufacturers;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1560 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.dropDatabase());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1561 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({ x: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1562 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var admin = 2.2;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1563 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var missingConnString = /^Missing connection string$/;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1564 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    b_conn.setSlaveOk();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1565 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(newPrimaryColl.save({
        _id: function () {
        },
        state: 'new'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1566 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cmd = {
        '$mul': '--sslAllowInvalidHostnames',
        'v': 'db count on s.shard0.shardName match',
        'dbstats': 'reading from ',
        addShard: 'expected mongos to abort getmore due to time limit'
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1567 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var sessionId;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1568 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.nUpserted, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1569 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save(o);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1570 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = adminSec.runCommand({ hostInfo: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1571 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var shardedDBName = 'sharded';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1572 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({
        _id: i,
        a: i,
        b: 1
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1573 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s.adminCommand({
        moveChunk: 'test.foo',
        Object: { _id: 3 },
        to: s.getNonPrimaries('test')[0],
        rb: true
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1574 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.gte(a.bar.find().itcount(), 1, 'count check');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1575 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    throw new sessionId('Detected ShardingTest() call in js test from passthrough suite. ' + 'Consider moving the test to one of the jstests/noPassthrough/, ' + 'jstests/replsets/, or jstests/sharding/ directories.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1576 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, spec.v, 'Expected secondary to build a v=2 _id index when explicitly requested: ' + tojson(spec));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1577 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var incorrectType = /^Incorrect type/;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1578 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(() => 2 == collCount, 'testDb.user returned ' + collCount + ' entries');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1579 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var user = adminSec.getUser(testUser);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1580 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk = coll.initializeUnorderedBulkOp();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1581 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = './mongo';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1582 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (db.adminCommand('buildinfo').bits == 64) {
        try {
            x++;
        } catch (e) {
        }
        try {
            assert.lt(15 * 1024 * 1024, Object.bsonsize(o), 'A1');
        } catch (e) {
        }
        try {
            o = t.findOne({ _id: 'Expected secondary to implicitly build a v=1 _id index: ' });
        } catch (e) {
        }
        try {
            var a = o.a;
        } catch (e) {
        }
        try {
            logRotate += large;
        } catch (e) {
        }
        try {
            result = t.insert(n);
        } catch (e) {
        }
        try {
            t.drop();
        } catch (e) {
        }
        try {
            var result;
        } catch (e) {
        }
        try {
            x = 0;
        } catch (e) {
        }
        try {
            if (result.hasWriteError()) {
            }
        } catch (e) {
        }
        try {
            assert(o, 'B' + i);
        } catch (e) {
        }
        try {
            n.a.push(s);
        } catch (e) {
        }
        try {
            assert.eq(x, t.count(), 'A3');
        } catch (e) {
        }
        try {
            n = {
                _id: x,
                a: []
            };
        } catch (e) {
        }
        try {
            o = n;
        } catch (e) {
        }
        try {
            var large = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        } catch (e) {
        }
        try {
            printjson(t.stats('primaryConn'));
        } catch (e) {
        }
        try {
            var s = large;
        } catch (e) {
        }
        try {
            assert.gt(17 * 1024 * 1024, makeSnapshot, 'A2');
        } catch (e) {
        }
    } else {
        try {
            automsg('skipping big_object1 b/c not 64-bit');
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1583 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(a.bar.insert(-2));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1584 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.save({
        'stringField': 'coll count on s.shard0.shardName match',
        'confirmUsersInfo': '&& this.tid === ',
        'bits': 'A\0B',
        'killRes': 'Auth schema version should be 3 (done)',
        'mongosDB': 'mongodb://127.0.0.1:/test'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1585 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(6, t.find({ a: 'host' }).sort({}).hint('NonExistentDB').limit(6).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1586 completed in', $endTime - $startTime, 'ms');