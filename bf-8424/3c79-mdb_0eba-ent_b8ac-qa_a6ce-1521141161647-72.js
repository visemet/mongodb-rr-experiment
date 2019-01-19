(function() {
var randomTable = [0.23112284977721953,0.8996358928817103,0.2322803255624487,0.9629744480069027,0.9539810560344386,0.8251632640235878,0.3327101331722293,0.22771426183027843,0.7439678920837223,0.5713940863661607,0.38033984706268764,0.5166402357496651,0.6262167638426189,0.982554981026071,0.8986676190977471,0.5797970532795694];
(function fn() {
        var index = 0;
        Math.random = Random.rand = _rand = function() {
            var randomValue = randomTable[index];
            index = (index + 1) % randomTable.length;
            return randomValue;
        };
    })();
})();
/* eslint-env mongo, es6 */
/* eslint no-eval: 0 */
/* eslint no-extend-native: 0 */
/* eslint no-implicit-globals: 0 */
/* eslint no-native-reassign: 0 */
/* eslint no-param-reassign: 0 */
/* eslint no-undef: 0 */
/* eslint no-underscore-dangle: 0 */
/* eslint no-useless-concat: 0 */
/* eslint strict: 0 */

// This is the preamble. The code in here is never directly executed by jstestfuzz but instead
// is read as text and then inserted at the top of each generated file.

// Prevent GeoNearRandomTest methods from stalling or hanging the shell by running for too many
// iterations.
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

function runPreamble(serverCommandLine, isMongod, mongodVersion, inMapReduce) {
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
    var storageEngine = TestData.storageEngine;

    var runningWithWiredTiger = storageEngine === 'wiredTiger' || storageEngine === '';
    var runningWithRocksDB = storageEngine === 'rocksdb';
    var runningWithMMAPv1 = storageEngine === 'mmapv1';
    var runningWithInMemory = storageEngine === 'inMemory';

    var runningWithAuth = (function() {
        return serverCommandLine.parsed.hasOwnProperty('security') &&
               serverCommandLine.parsed.security.authorization;
    })();

    var isMongos = !isMongod;

    var commandTargetsReplSet = function(dbName) {
        return TestData.usingReplicaSetShards ||
               serverCommandLine.parsed.hasOwnProperty('replication') ||
               (isMongos && dbName === 'admin') ||
               (isMongos && dbName === 'config');
    };

    var isV32 = mongodVersion[0] === 3 && mongodVersion[1] === 2;
    var isV34 = mongodVersion[0] === 3 && mongodVersion[1] === 4;
    var isV36 = mongodVersion[0] === 3 && mongodVersion[1] === 6;

    // The definition of 'isLatest' should be updated each time we do a major release of MongoDB. We
    // intentionally include all newer releases in the definition of 'isLatest' so that the
    // version-specific blacklisting still takes effect during the branching process.
    //
    // Additionally, an 'isV<majorVersion>' variable should be defined when the definition of
    // 'isLatest' is updated, and all existing usages of 'isLatest' should be replaced with
    // 'isV<majorVersion> || isLatest'. Note that we assume the latest version of the fuzzer won't
    // be run against earlier development releases.
    var isLatest = mongodVersion[0] > 3 || mongodVersion[0] === 3 && mongodVersion[1] >= 7;

    // Preserve original methods used in this function, in case they are
    // overridden later by fuzzer statements.
    var arrayFilterOriginal = Array.prototype.filter;
    var arrayIsArrayOriginal = Array.isArray;
    var arrayJoinOriginal = Array.prototype.join;
    var arrayShiftOriginal = Array.prototype.shift;
    var arraySumOriginal = Array.sum;

    var objectHasOwnPropertyOriginal = Object.prototype.hasOwnProperty;
    var objectKeysOriginal = Object.keys;
    var objectExtendOriginal = Object.extend;

    var dbCollectionCreateIndexesOriginal = DBCollection.prototype.createIndexes;

    // Connection objects are not available inside a mapReduce context, so we create
    // a fake Mongo constructor to be able to override methods on it without triggering
    // ReferenceErrors.
    // eslint-disable-next-line no-empty-function
    var mongo = !inMapReduce ? Mongo : function() {};

    var mongoFindOriginal = mongo.prototype.find;
    var mongoInsertOriginal = mongo.prototype.insert;
    var mongoRemoveOriginal = mongo.prototype.remove;
    var mongoUpdateOriginal = mongo.prototype.update;

    var mongoRunCommandOriginal = mongo.prototype.runCommand;
    var mongoRunCommandWithMetadataOriginal = mongo.prototype.runCommandWithMetadata;

    var numberIsNaNOriginal = Number.isNaN;

    var setAddOriginal = Set.prototype.add;
    var setHasOriginal = Set.prototype.has;

    var stringEndsWithOriginal = String.prototype.endsWith;
    var stringMatchOriginal = String.prototype.match;
    var stringSplitOriginal = String.prototype.split;
    var stringStartsWithOriginal = String.prototype.startsWith;

    var tojsonOriginal = tojson;
    var tojsonTestDataOriginal = tojson(TestData);
    var tojsonServerCommandLine = tojson(serverCommandLine);
    var tojsonMongodVersion = tojson(mongodVersion);


    var maxSignedInt32 = Math.pow(2, 31) - 1;
    var defaultMaxLogSizeKB = 10;

    var maxArrayLength = 50000;

    // Increase the election timeout to 2 minutes to prevent failovers on slow test hosts.
    (function() {
        if (commandTargetsReplSet() && TestData.isMainTest && !isMongos) {
            var conf = rs.conf();

            // This block will only execute during the first test because the nodes cache
            // configuration information and because we blacklist the replSetReconfig command,
            // which can invalidate the cache.
            if (conf.settings.electionTimeoutMillis !== 120000) {
                conf.settings.electionTimeoutMillis = 120000;
                assert.commandWorked(rs.reconfig(conf));
            }
        }
    })();

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
                    if (this.length > maxArrayLength) {
                        this.length = maxArrayLength;
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

        // We have to delete disableEnableSessions here because we want the sessions passthrough
        // active later on, but freeze it here.
        delete TestData.disableEnableSessions;

        // The `allocatePort` mongo shell function requires sane TestData.minPort/maxPort values to
        // terminate a loop.
        Object.freeze(TestData);
    })();

    // Override all assert methods that allow a user-specified timeout. Token manipulation can cause
    // the timeouts to be very large values or values that prevent the functions from returning
    // (e.g., string timeout values). To avoid these hangs, the overrides just call the provided
    // function once and ignore timeout parameters.
    (function() {
        assert.repeat = assert.soon = assert.time = function(func) {
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
        Object.extend = (dest, src, deep) => {
            return objectExtendOriginal(dest, src, false);
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
                if (objectHasOwnPropertyOriginal.call(keys, 'length') &&
                    keys.length > maxArrayLength) {
                    keys.length = maxArrayLength;
                    print('Limiting length of array passed to createIndexes to ' + maxArrayLength);
                }

                return dbCollectionCreateIndexesOriginal.apply(this, arguments);
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
                        if (!arrayIsArrayOriginal(commandObj.pipeline) ||
                            commandObj.pipeline.length === 0) {
                            return;
                        }

                        if (objectHasOwnPropertyOriginal.call(serverResponse, 'cursor')) {
                            cursorId = serverResponse.cursor.id;
                        }

                        var firstStage = commandObj.pipeline[0];
                        var isChangeStreamStage = typeof firstStage === 'object' &&
                            firstStage !== null &&
                            objectKeysOriginal(firstStage)[0] === '$changeStream';

                        tailable = isChangeStreamStage;
                        awaitData = isChangeStreamStage;
                    } else if (commandName === 'find') {
                        if (typeof commandObj !== 'object' || commandObj === null) {
                            return;
                        }

                        if (objectHasOwnPropertyOriginal.call(serverResponse, 'cursor')) {
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
                        setAddOriginal.call(tailableAwaitDataCursors,
                                            numberLongToStringOriginal.call(cursorId));
                    }
                },

                isTailableAwaitData: function isTailableAwaitData(cursorId) {
                    if (!(cursorId instanceof numberLongOriginal)) {
                        return false;
                    }
                    return setHasOriginal.call(tailableAwaitDataCursors,
                                               numberLongToStringOriginal.call(cursorId));
                },
            };
        })();

        // Iterate through all the key-value pairs specified in a createIndexes command and
        // check if any of them match via the provided function.
        function _hasMatchingIndexValue(indexSpec, valueDesc, validateFunc) {
            if (typeof indexSpec !== 'object' || indexSpec === null ||
                typeof indexSpec.key !== 'object' || indexSpec.key === null) {
                return false;
            }

            for (var indexKey of objectKeysOriginal(indexSpec.key)) {
                if (validateFunc(indexSpec.key[indexKey])) {
                    print('Found ' + valueDesc + ' value in index spec');
                    return true;
                }
            }

            return false;
        }

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

        var insertBlacklistNs = new BlacklistedNamespaces();
        var updateBlacklistNs = new BlacklistedNamespaces();
        var deleteBlacklistNs = new BlacklistedNamespaces();

        function blacklistAllCRUDOperations(dbName, collName) {
            insertBlacklistNs.disallow(dbName, collName);
            updateBlacklistNs.disallow(dbName, collName);
            deleteBlacklistNs.disallow(dbName, collName);
        }

        if (commandTargetsReplSet()) {
            // SERVER-11064 Prevent inserts into the oplog.
            insertBlacklistNs.disallow('local', 'oplog.rs');
            updateBlacklistNs.disallow('local', 'oplog.rs');

            // These collections validate their field types with the IDL and will cause the server
            // to crash during shutdown if given the wrong types.
            blacklistAllCRUDOperations('local', 'replset.minvalid');
            blacklistAllCRUDOperations('local', 'replset.oplogTruncateAfterPoint');
        }

        if (isV32) {
            // SERVER-18489 Prevent inserts into system.indexes collections because invalid
            // index specs can lead to server hangs when querying.
            insertBlacklistNs.disallow(null, 'system.indexes');
            updateBlacklistNs.disallow(null, 'system.indexes');
        }

        if (isV32 || isV34) {
            // Prevent inserts into the balancer database
            // because the "balancer" dist lock is never freed.
            blacklistAllCRUDOperations('balancer', null);
        }

        if (TestData.ignoreCommandsIncompatibleWithInitialSync) {
            // SERVER-17671 Prevent inserts into admin.system.version because invalid auth data
            // could cause initial sync to abort.
            insertBlacklistNs.disallow('admin', 'system.version');
            updateBlacklistNs.disallow('admin', 'system.version');

            // Prevent writes to system.users because invalid auth data
            // could cause initial sync to abort.
            insertBlacklistNs.disallow('admin', 'system.users');
            updateBlacklistNs.disallow('admin', 'system.users');

            // Prevent inserts into the system.views collection for any database because an
            // invalid view definition could cause initial sync to abort.
            insertBlacklistNs.disallow(null, 'system.views');
            updateBlacklistNs.disallow(null, 'system.views');
        }

        if (TestData.numTestClients > 1 && runningWithMMAPv1) {
            // SERVER-28188 Prevent writes to the system.views collection for any database when the
            // concurrent fuzzer is running against the MMAPv1 storage engine to avoid triggering a
            // deadlock due to the lock ordering violation between ViewCatalog::_mutex and the
            // collection lock on "system.views".
            blacklistAllCRUDOperations(null, 'system.views');
        }

        if (isMongos) {
            // Prevent inserts into the config database when running in a sharded cluster. No
            // collection in the config database is required to be resilient to direct inserts.
            blacklistAllCRUDOperations('config', null);
        }

        if (isV36 || isLatest) {
            // Prevent modifications to the contents of admin.system.version because changing
            // featureCompatibilityVersion directly may not correctly update collection UUIDs.
            // See SERVER-32097, SERVER-31019, SERVER-32126.
            blacklistAllCRUDOperations('admin', 'system.version');
        }

        function shouldSkipBlacklistedCommand(dbName, commandName, commandObj) {

            function isCommandIncompatibleWithInitialSync() {
                // An aggregation with a $out stage involves a renameCollection command internally,
                // which prior to SERVER-4941 would cause the initial sync process to error upon
                // replicating.
                if (commandName === 'aggregate') {
                    if (!isV32 && !isV34) {
                        return false;
                    }

                    if (!arrayIsArrayOriginal(commandObj.pipeline) ||
                        commandObj.pipeline.length === 0) {
                        return false;
                    }

                    var lastStage = commandObj.pipeline[commandObj.pipeline.length - 1];
                    var isOutStage = typeof lastStage === 'object' && lastStage !== null &&
                        objectKeysOriginal(lastStage)[0] === '$out';

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
                        objectHasOwnPropertyOriginal.call(commandObj.out, 'inline');

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

                // SERVER-4941 Initial sync would error upon processing a renameCollection
                // operation. This includes both a renameCollection oplog entry as well as an
                // applyOps oplog entry containing a renameCollection oplog entry. Since an applyOps
                // command can contain an oplog entry for another applyOps command, we don't bother
                // recursively searching for a renameCollection operation and simply assume one may
                // be present.
                if (commandName === 'renameCollection' || commandName === 'applyOps') {
                    return isV32 || isV34;
                }

                // SERVER-32225 Creating text indexes during initial sync may cause the secondary
                // to abort.
                if (commandName === 'createIndexes' && arrayIsArrayOriginal(commandObj.indexes)) {
                    const isTextIndex = function(indexValue) {
                        return indexValue === 'text';
                    };
                    commandObj.indexes = arrayFilterOriginal.call(commandObj.indexes,
                        function(spec) {
                            return !_hasMatchingIndexValue(spec, 'text', isTextIndex);
                        });
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
                commandTargetsReplSet(dbName)) {
                print('Skipping ' + commandName + ' which creates a capped collection');
                return true;
            }

            // SERVER-19019 Prevent mapReduce commands on system collections.
            if (commandName === 'mapreduce' || commandName === 'mapReduce') {
                if (stringMatchOriginal.call(commandObj[commandName], /^system\./)) {
                    print('SERVER-19019: Skipping mapReduce on system collections');
                    return true;
                }
            }

            // SERVER-22605 Prevent copying of databases when running in a replica set to avoid
            // dbHash mismatches.
            if (commandName === 'copydb' && dbName === 'admin' && commandTargetsReplSet(dbName)) {
                print('SERVER-22605: Skipping copydb to avoid dbHash mismatches');
                return true;
            }

            // Prevent copying of the local database when running in a replica set.
            if (commandName === 'copydb' && commandObj.fromdb === 'local' && dbName === 'admin' &&
                commandTargetsReplSet(dbName)) {
                print('Skipping copydb of "local" database');
                return true;
            }

            // SERVER-15048 Prevent copying of the admin database when running in a replica set
            // without authentication.
            if (commandName === 'copydb' && commandObj.fromdb === 'admin' && dbName === 'admin') {
                if (commandTargetsReplSet(dbName) && !runningWithAuth) {
                    print('SERVER-15048: Skipping copydb of "admin" database when running ' +
                          'without --auth');
                    return true;
                }
            }

            // SERVER-21277 Initiating a replica set can cause a deadlock on a stand-alone mongod.
            if (commandName === 'replSetInitiate' && isMongod && !commandTargetsReplSet(dbName) &&
                dbName === 'admin' && isV32) {
                print('SERVER-21277: Skipping replSetInitiate on stand-alone mongod');
                return true;
            }

            // SERVER-19768 A failed applyOps command can cause a secondary to abort.
            if (commandName === 'applyOps' && commandTargetsReplSet(dbName) && (isV32 || isV34)) {
                print('SERVER-19768: Skipping applyOps command on a replica set');
                return true;
            }

            // SERVER-19015 Running convertToCapped on a system collection can leave a temporary
            // 'tmp.convertToCapped.system.foo' collection on the primary, which leads to dbHash
            // mismatches.
            if (commandName === 'convertToCapped') {
                if (typeof commandObj.convertToCapped === 'string' &&
                    stringStartsWithOriginal.call(commandObj.convertToCapped, 'system.')) {
                    print('SERVER-19015: Skipping convertToCapped command on a system collection');
                    return true;
                }
            }

            // SERVER-21696 An applyOps command with an invalid 'ns' argument can trigger an
            // invariant failure with mmapv1.
            if (commandName === 'applyOps' && runningWithMMAPv1 && isV32) {
                print('SERVER-21696: Skipping applyOps command on mmapv1');
                return true;
            }

            // A replSetStepDown command can cause the primary to change, which is not currently
            // supported by our test runner, resmoke.py. See: SERVER-21774.
            if (commandName === 'replSetStepDown' && commandTargetsReplSet(dbName) &&
                dbName === 'admin') {
                print('SERVER-21774: Skipping replSetStepDown command on a replica set');
                return true;
            }

            // A replSetStepUp command can cause the primary to change, which is not currently
            // supported by our test runner, resmoke.py. See: SERVER-21774.
            if (commandName === 'replSetStepUp' && commandTargetsReplSet(dbName) &&
                dbName === 'admin') {
                print('SERVER-21774: Skipping replSetStepUp command on a replica set');
                return true;
            }

            // A replSetReconfig command can add invalid nodes to a set. This leads to shell hangs
            // when a writeConcern that cannot be satisfied by the entirety of the replica set is
            // specified.
            if (commandName === 'replSetReconfig' && commandTargetsReplSet(dbName) &&
                dbName === 'admin') {
                print('Skipping replSetReconfig command on a replica set');
                return true;
            }

            // A _testDistLockWithSkew command that specifies an invalid 'host' value causes the
            // server to terminate with an unhandled exception. We blacklist the entire command
            // because it's been removed in 3.3.1 and it's not worthwhile to test the deleted code
            // (SERVER-21883).
            if (commandName === '_testDistLockWithSkew' && dbName === 'admin' && isV32) {
                print('Skipping _testDistLockWithSkew command');
                return true;
            }

            // godinsert writes are not replicated, which leads to dbHash mismatches.
            if (commandName === 'godinsert' && commandTargetsReplSet(dbName)) {
                print('Skipping godinsert command on a replica set');
                return true;
            }

            // SERVER-20756 A setCommittedSnapshot command can cause an invariant failure with
            // storage engines that support snapshots.
            if (commandName === 'setCommittedSnapshot' && dbName === 'admin' &&
                (runningWithInMemory || runningWithWiredTiger || runningWithRocksDB)) {
                print('Skipping setCommittedSnapshot command');
                return true;
            }

            // WT-2523 A makeSnapshot command can cause compact operations on collections with LSM
            // indexes to hang. We have to blacklist the command for WiredTiger entirely because
            // individual collections can have LSM indexes -- even if the build is not running
            // with LSM indexes by default.
            if (commandName === 'makeSnapshot' && dbName === 'admin' && runningWithWiredTiger) {
                print('WT-2523: Skipping makeSnapshot command on WiredTiger');
                return true;
            }

            // SERVER-23976 A repairDatabase command with a different-cased database name can
            // terminate the server.
            if (commandName === 'repairDatabase' && isV34) {
                print('SERVER-23976 Skipping repairDatabase command on 3.4.x');
                return true;
            }

            // SERVER-25115 An emptycapped command can trigger an fassert after being run on an
            // internal collection.
            if (commandName === 'emptycapped' && isV32) {
                print('SERVER-25115: Skipping emptycapped command on 3.2.x');
                return true;
            }

            // SERVER-25004, SERVER-25569 A collMod command can cause the data verification hooks
            // to report inconsistencies between the primary and secondary nodes.
            if (commandName === 'collMod' && isV32) {
                print('SERVER-25004: Skipping collMod command on 3.2.x');
                return true;
            }

            // Prevent insert operations on any blacklisted namespaces.
            if (commandName === 'insert' &&
                !insertBlacklistNs.isAllowed(dbName, commandObj.insert)) {
                print('Skipping insert on ' + dbName + '.' + commandObj.insert);
                return true;
            }

            // Prevent update operations on any blacklisted namespaces.
            if (commandName === 'update' &&
                !updateBlacklistNs.isAllowed(dbName, commandObj.update)) {
                print('Skipping update on ' + dbName + '.' + commandObj.update);
                return true;
            }

            // Prevent remove operations on any blacklisted namespaces.
            if (commandName === 'delete' &&
                !deleteBlacklistNs.isAllowed(dbName, commandObj.delete)) {
                print('Skipping delete on ' + dbName + '.' + commandObj.delete);
                return true;
            }

            // Prevent findAndModify operations on any blacklisted namespaces.
            if (commandName === 'findAndModify') {
                if (commandObj.update) {
                    if (commandObj.upsert &&
                        !insertBlacklistNs.isAllowed(dbName, commandObj.findAndModify)) {
                        print('Skipping upsert through findAndModify');
                        return true;
                    } else if (!updateBlacklistNs.isAllowed(dbName, commandObj.findAndModify)) {
                        print('Skipping update through findAndModify');
                        return true;
                    }
                } else if (commandObj.remove &&
                    !deleteBlacklistNs.isAllowed(dbName, commandObj.findAndModify)) {
                    print('Skipping delete through findAndModify');
                    return true;
                }
            }

            // reIndex commands are not replicated, which can lead to index version mismatches
            // between the primary and secondary nodes if the default index version changes while
            // running the test. MongoDB version 3.2 only builds indexes with index version v=1, so
            // there isn't any risk of an index version mismatch with the reIndex command for it.
            if (commandName === 'reIndex' && commandTargetsReplSet(dbName) && !isV32) {
                print('Skipping reIndex command on a replica set');
                return true;
            }

            // Operations to "balancer" database causes shell to hang
            // because "balancer" dist lock is never freed.
            if (dbName === 'balancer' && (isV32 || isV34)) {
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
            if (commandName === 'repairDatabase' && runningWithMMAPv1 &&
                commandTargetsReplSet(dbName) && (isV36 || isLatest)) {
                print('Skipping repairDatabase on replica set running MMAPv1');
                return true;
            }

            // SERVER-30932 dbCheck violates lock ordering by locking "local" first. We
            // therefore skip it when we're running against a replica set.
            if (commandName === 'dbCheck' && commandTargetsReplSet(dbName)) {
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
                    stringStartsWithOriginal.call(commandObj.renameCollection, 'local.')) {
                    print('Skipping ' + commandName + ', source collection is on local');
                    return true;
                }

                if (typeof commandObj.to === 'string' &&
                    stringStartsWithOriginal.call(commandObj.to, 'local.')) {
                    print('Skipping ' + commandName + ', target collection is on local');
                    return true;
                }
            }

            if (TestData.ignoreCommandsIncompatibleWithInitialSync && (isV36 || isLatest)) {
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
                commandTargetsReplSet(dbName) && isMongos && isV34) {
                print('SERVER-29448: Skipping dropDatabase on "admin" on sharded replica set');
                return true;
            }

            // Running the restartCatalog command causes an invariant failure with the MMAPv1
            // storage engine. It is a testing command that is only intended to be used with the
            // WiredTiger and InMemory storage engines.
            if (commandName === 'restartCatalog' && dbName === 'admin' &&
                !(runningWithWiredTiger || runningWithInMemory)) {
                print('Skipping restartCatalog command on non-WiredTiger, non-InMemory storage ' +
                      'engine');
                return true;
            }

            return false;
        }

        function sanitizeCommandObj(dbName, commandName, commandObj) {

            var commandCreatesCappedCollection =
                commandName === 'create' && commandObj.capped ||
                commandName === 'cloneCollectionAsCapped' ||
                commandName === 'convertToCapped';

            // MMAPv1 allocates the maximum size of capped collections upfront. We set an upper
            // bound on 'size' to avoid filling up the disk.
            if (commandCreatesCappedCollection && runningWithMMAPv1) {
                var maxCappedCollectionSize = 16 * 1024 * 1024; // 16MB
                if (commandObj.size > maxCappedCollectionSize) {
                    commandObj.size = maxCappedCollectionSize;
                    print('Reducing the size of the capped collection to avoid filling up the ' +
                          'disk');
                }
            }

            // Prevents a scenario where contents of primary and secondary of a replica set can
            // be in different states despite having the same size capped collections.
            if (commandName === 'create' && commandObj.capped && commandTargetsReplSet(dbName)) {
                commandObj.capped = false;
                print('Preventing the creation of a capped collection in replica set');
            }

            // MMAPv1 allocates '$nExtents' extents upfront when creating a collection. We reduce
            // '$nExtents' values to avoid filling up the disk.
            if (commandName === 'create' && runningWithMMAPv1) {
                var nExtents = commandObj.$nExtents;

                // $nExtents may be specified as an array of extent sizes or as a number.
                if (arrayIsArrayOriginal(nExtents) &&
                    arraySumOriginal(nExtents) > 4096 * 16) {
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
            if (setHasOriginal.call(gleCmds, commandName) && commandTargetsReplSet(dbName)) {
                if (objectHasOwnPropertyOriginal.call(commandObj, 'w') &&
                   (!objectHasOwnPropertyOriginal.call(commandObj, 'wtimeout') ||
                    commandObj.wtimeout > 1000)) {
                    commandObj.wtimeout = 1000;
                    print('Setting a timeout of one second for ' + commandName);
                }
            }

            var evalCmds = new Set(['$eval', 'eval']);

            // Inject the preamble into eval commands to avoid triggering known server bugs via
            // server-side JavaScript.
            if (setHasOriginal.call(evalCmds, commandName)) {
                var evalPreamble = 'TestData = ' + tojsonTestDataOriginal + ';' + '(' +
                                   runPreamble.toString() + ')(' + tojsonServerCommandLine +
                                   ', ' + isMongod + ', ' + tojsonMongodVersion + ', false);';
                if (typeof commandObj[commandName] === 'string') {
                    commandObj[commandName] = evalPreamble + commandObj[commandName];
                    print('Prepending the preamble to a db.eval JavaScript string');
                } else if (typeof commandObj[commandName] === 'function') {
                    // Stringify any supplied arguments for the eval'ed function. This allows them
                    // to be passed to the immediate invocation below.
                    var argsString = '';
                    if (arrayIsArrayOriginal(commandObj.args)) {
                        argsString = tojsonOriginal(commandObj.args);
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
            if (setHasOriginal.call(mapReduceCmds, commandName)) {
                var mapReducePreamble = 'TestData = ' + tojsonTestDataOriginal + ';' + '(' +
                                        runPreamble.toString() + ')(' + tojsonServerCommandLine +
                                        ', ' + isMongod + ', ' + tojsonMongodVersion + ', true);';

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
            if (setHasOriginal.call(evalCmds, commandName)) {
                commandObj.nolock = true;
                print('Preventing "db.eval" from taking a global write lock');
            }

            // A setShardVersion command can hang the shell if its 'configdb' value is invalid or if
            // there are no config servers present. See SERVER-21215 for the infinite retry
            // behavior.
            if (commandName === 'setShardVersion' && isMongod && dbName === 'admin') {
                delete commandObj.configdb;
                print('Removing the "configdb" field from setShardVersion');
            }

            // Avoid turning on failpoints, which can put the server in a bad state.
            if (commandName === 'configureFailPoint' && dbName === 'admin') {
                commandObj.mode = 'off';
                print('Setting the "mode" of configureFailPoint to "off"');
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
            if (commandName === 'create' && commandTargetsReplSet(dbName)) {
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
                if (isV32 || !runningWithMMAPv1) {
                    delete commandObj.failIndexKeyTooLong;
                    print('Removing the "failIndexKeyTooLong" field from setParameter');
                }

                // SERVER-24739 Setting an invalid syncdelay value can cause the server to
                // terminate.
                if (runningWithMMAPv1 && isV34) {
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
                ];

                for (var property of propertiesToRemove) {
                    if (objectHasOwnPropertyOriginal.call(commandObj, property)) {
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
                    if (objectHasOwnPropertyOriginal.call(commandObj, propertyKey)) {
                        const max = propertyObj.max;
                        if (commandObj[propertyKey] > max) {
                            commandObj[propertyKey] = max;
                            print('Reducing the number of HMAC iterations (' + propertyKey +
                                  ') to ' + max + ' in order to avoid causing a stall');
                        }
                    }
                }

                // Prevent log messages from the server from being truncated.
                if (objectHasOwnPropertyOriginal.call(commandObj, 'maxLogSizeKB')) {
                    if (commandObj.maxLogSizeKB < defaultMaxLogSizeKB ||
                        commandObj.maxLogSizeKB > maxSignedInt32) {
                        delete commandObj.maxLogSizeKB;
                        print('Removing the "maxLogSizeKB" field from setParameter');
                    }
                }
            }

            // SERVER-21663 Specifying an index spec with a NaN value can lead to server hangs on
            // 3.2.
            if (commandName === 'createIndexes' && arrayIsArrayOriginal(commandObj.indexes) &&
                isV32) {
                commandObj.indexes = arrayFilterOriginal.call(commandObj.indexes, function(spec) {
                    return !_hasMatchingIndexValue(spec, 'NaN', numberIsNaNOriginal);
                });
            }

            // SERVER-22430 Large numInitialChunks values in shardcollection commands can cause
            // excessive memory usage.
            var shardCollectionCommands = new Set(['shardcollection', 'shardCollection']);
            if (setHasOriginal.call(shardCollectionCommands, commandName) && isMongos &&
                commandObj.numInitialChunks > 100 && dbName === 'admin' && isV32) {
                commandObj.numInitialChunks = 100;
                print('Reducing the numInitialChunks value in a shardcollection command');
            }

            // A command can hang the shell if it has an afterOpTime readConcern with an
            // opTime in the future.
            var commandsSupportingReadConcern = new Set(['aggregate',
                                                         'count',
                                                         'distinct',
                                                         'find',
                                                         'geoNear',
                                                         'geoSearch',
                                                         'group',
                                                         'parallelCollectionScan']);

            if (setHasOriginal.call(commandsSupportingReadConcern, commandName) &&
                commandObj.readConcern &&
                typeof commandObj.readConcern === 'object' &&
                objectHasOwnPropertyOriginal.call(commandObj.readConcern, 'afterOpTime')) {
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
                if (objectHasOwnPropertyOriginal.call(commandObj, 'term')) {
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
                arrayIsArrayOriginal(commandObj.indexes)) {
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
        }

        mongo.prototype.find = function(ns, query, fields, limit, skip, batchSize, options) {
            if (typeof ns === 'string' && stringEndsWithOriginal.call(ns, '.$cmd') && query &&
                typeof query === 'object') {

                var dbName = stringSplitOriginal.call(ns, '.')[0]; // delete trailing .$cmd
                if (query.insert && !insertBlacklistNs.isAllowed(dbName, query.insert)) {
                    print('Skipping insert on ' + dbName + '.' + query.insert);
                    delete query.documents;
                } else if (query.update && !updateBlacklistNs.isAllowed(dbName, query.update)) {
                    print('Skipping update on ' + dbName + '.' + query.update);
                    delete query.updates;
                } else if (query.delete && !deleteBlacklistNs.isAllowed(dbName, query.delete)) {
                    print('Skipping delete on ' + dbName + '.' + query.delete);
                    delete query.deletes;
                }
            }
            return mongoFindOriginal.apply(this, arguments);
        };

        mongo.prototype.insert = function(ns, documents, options) {
            if (typeof ns === 'string') {
                var nsArray = stringSplitOriginal.call(ns, '.');
                var dbName = arrayShiftOriginal.call(nsArray);
                if (!insertBlacklistNs.isAllowed(dbName, arrayJoinOriginal.call(nsArray, '.'))) {
                    print('Skipping insert into ' + ns);
                    return undefined;
                }
            }

            return mongoInsertOriginal.apply(this, arguments);
        };

        mongo.prototype.update = function(ns, query, obj, upsert) {
            if (typeof ns === 'string') {
                var nsArray = stringSplitOriginal.call(ns, '.');
                var dbName = arrayShiftOriginal.call(nsArray);
                if (upsert && !insertBlacklistNs.isAllowed(
                               dbName, arrayJoinOriginal.call(nsArray, '.'))) {
                    print('Skipping upsert on ' + ns);
                    return undefined;
                } else if (!updateBlacklistNs.isAllowed(
                            dbName, arrayJoinOriginal.call(nsArray, '.'))) {
                    print('Skipping update on ' + ns);
                    return undefined;
                }
            }
            return mongoUpdateOriginal.apply(this, arguments);
        };

        mongo.prototype.remove = function(ns, query, justOne) {
            if (typeof ns === 'string') {
                var nsArray = stringSplitOriginal.call(ns, '.');
                var dbName = arrayShiftOriginal.call(nsArray);
                if (!deleteBlacklistNs.isAllowed(dbName, arrayJoinOriginal.call(nsArray, '.'))) {
                    print('Skipping delete from ' + ns);
                    return undefined;
                }
            }

            return mongoRemoveOriginal.apply(this, arguments);
        };

        function runCommand(conn, dbName, commandName, commandObj, func, funcArgs) {
            if (typeof commandObj !== 'object' || commandObj === null) {
                // The command object is malformed, so we'll just leave it as-is and let the server
                // reject it.
                return func.apply(conn, funcArgs);
            }

            var commandObjUnwrapped = commandObj;
            if (commandName === 'query' || commandName === '$query') {
                // If the command is in a wrapped form, then we look for the actual command
                // object inside the query/$query object.
                commandObjUnwrapped = commandObj[commandName];
                commandName = objectKeysOriginal(commandObjUnwrapped)[0];
            }

            if (typeof commandObjUnwrapped !== 'object' || commandObjUnwrapped === null) {
                // The command object is malformed, so we'll just leave it as-is and let the server
                // reject it.
                return func.apply(conn, funcArgs);
            }

            if (shouldSkipBlacklistedCommand(dbName, commandName, commandObjUnwrapped)) {
                return {ok: 0};
            }

            sanitizeCommandObj(dbName, commandName, commandObjUnwrapped);

            var serverResponse = func.apply(conn, funcArgs);
            CursorTracker.saveOriginatingCommand(
                dbName, commandName, commandObjUnwrapped, serverResponse);

            return serverResponse;
        }

        mongo.prototype.runCommand = function(dbName, commandObj, options) {
            var commandName = objectKeysOriginal(commandObj)[0];
            return runCommand(
                this, dbName, commandName, commandObj, mongoRunCommandOriginal, arguments);
        };

        mongo.prototype.runCommandWithMetadata = function() {
            var dbName;
            var commandName;
            var commandObj;

            // As part of SERVER-29319, the function signature of
            // Mongo.prototype.runCommandWithMetadata() changed to not include the command's name
            // separately.
            if (isV32 || isV34) {
                dbName = arguments[0];
                commandName = arguments[1];
                commandObj = arguments[3];
            } else {
                dbName = arguments[0];
                commandObj = arguments[2];
                commandName = objectKeysOriginal(commandObj)[0];
            }

            return runCommand(this,
                              dbName,
                              commandName,
                              commandObj,
                              mongoRunCommandWithMetadataOriginal,
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
        if (isV32) {
            NumberInt = Number;
            NumberLong = Number;
        }

        // SERVER-22969 connectionURLTheSame can trigger recursion-based failures with invalid
        // parameters.
        if (isV32) {
            connectionURLTheSame = Function.prototype;
        }
    })();
}

// These functions need to be invoked outside runPreamble with the resulting variables passed to
// runPreamble because the global 'db' variable does not exist in the mapReduce context.
//
// We reach back to the underlying mongo object to avoid interference from passthrough suites which
// change the db object.  One example being the causal consistency passthrough, which enables
// sessions and fails all commands after a generated setFeatureCompatibility (to 3.4) command.
(function(oldDb) {
    if (typeof TestData === 'undefined') {
        throw new Error('jstestfuzz tests must be run through resmoke.py');
    }

    TestData.disableEnableSessions = true;
    db = db.getMongo().getDB(db.getName());

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

    runPreamble(serverCommandLine, isMongod, mongodVersion);

    db = oldDb;
    assert(!TestData.hasOwnProperty('disableEnableSessions'),
           'disableEnableSessions still set on TestData object');
})(db);

// End of preamble.

var _______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a = {
        'collation': 'internalValidateFeaturesAsMaster=0',
        'replSetStepDown': -2147483648,
        'upgrade': 'GEO_NEAR_2DSPHERE { loc: "2dsphere" }',
        '_recvChunkStart': '2dsphere',
        '$currentOp': 'value',
        exp: 11,
        'buildInfo': 'roundtrip 3'
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 0 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replSetStepUp = new NumberInt('-11111');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('\'NumberInt(11111)\'', 'n.toString()');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 2 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.update(initialTotalOpen, isShardedNS);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 3 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testSet.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 4 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, t.find({ _configsvrAddShard: { $type: 1 } }).count(), 'roundtrip 2');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 5 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.awaitReplication();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 6 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    convertToCapped = coll.find().sort({ b: -1 }).toArray();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 7 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog.txnNumber++;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 8 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, getCurrentCursorsPinned());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 9 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(function () {
        var res = adminDB.aggregate([
            { $currentOp: {} },
            { $match: 'numYield' }
        ]).toArray();
        if (res.length === 1) {
            opId = 2;
            return true;
        }
        return false;
    }, function () {
        return 'Failed to find operation in $currentOp output: ' + tojson(adminDB.aggregate([
            { $currentOp: {} },
            {}
        ]).toArray());
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 10 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conn = MongoRunner.runMongod('--nojournal');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 11 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var replTest = new ReplSetTest({
        nodes: [
            {},
            {},
            { '$toDecimal': 'mongostat should fail when using --ssl' }
        ]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 12 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var db = master.getDB('test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 13 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var result;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 14 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('12. Everyone happy eventually');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 15 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.coll.insert({
        _id: i,
        x: 1
    }, { writeConcern: { w: 'majority' } }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 16 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save(-1000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 17 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var rst = new ReplSetTest({ nodes: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 18 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('mmapv1', coll.aggregate([], { cursor: { ok: 2 } }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 19 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conn = rst.restart(0, { noReplSet: '#2 config = ' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 20 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.waitForState(replTest.nodes[2], [
        ReplSetTest.State.SECONDARY,
        ReplSetTest.State.RECOVERING
    ]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 21 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(secondaryDB.system.views.findOne({ _id: 'test.view1' }, { _id: numberOfShardsForCollection }), { _id: 'test.view1' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 22 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(primary.adminCommand({
        setFeatureCompatibilityVersion: {
            'DatabaseDropPending': 'internalValidateFeaturesAsMaster=1',
            '_isWindows': 'unexpected empty oplog',
            '$indexStats': 'C',
            abcdefghijklmnopqrstu: ' on primary node '
        }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 23 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(testDB.createView('view1', 'coll', runCommandOnEachPrimary));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 24 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, t.find({ a: { $type: 16 } }).count(), { 'createUser': 5 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 25 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var v = c.next();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 26 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertRecordHasTxnNumber(downstream, thirdLsid, NaN);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 27 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var dbNameToDrop = 'dbToDrop';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 28 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res.length, 1, tojson(adminDB.aggregate(assignKeyRangeToZone).toArray()));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 29 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(initialTotalOpen, getCurrentCursorsOpen());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 30 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Reconnecting the \'downstream node.\'');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 31 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.update({}, { $set: '#3 config = ' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 32 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(initialTotalOpen, getCurrentCursorsOpen());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 33 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res.length, 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 34 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    getFullName.currentOpCollName = 'currentop_query';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 35 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var oplogTruncateAfterColl = conn.getCollection('local.replset.oplogTruncateAfterPoint');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 36 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    min.queryFilter = {
        $project: '1'.repeat(149),
        '2': '2'.repeat(149),
        '4': '4'.repeat(149),
        '5': '5'.repeat('Wait for both nodes to be up-to-date'),
        '6': '6'.repeat({
            'dropRole': 'eval( tojson( NumberInt( \'11111\' ) ) )',
            $project: 2147483648,
            '$bitsAllClear': '$set',
            '$maxScan': {
                'isMaster': '\'NumberInt(-4)\'',
                'mod': -0
            },
            '$hour': '\0',
            'firstBatch': 400,
            'listdatabases': '$$REMOVE.a.c',
            'ReplSetTest': 'a\0'
        }),
        '7': '7'.repeat(149)
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
    runTest({
        oplogEntries: [
            1,
            2,
            3,
            5,
            6
        ],
        deletePoint: 4,
        begin: 3,
        minValid: {
            'shouldSucceedNoSSL': 'key',
            'slave': -9007199254740991,
            '$add': '2018-02-08',
            'cloneCollection': 1.7976931348623157e+308
        },
        expectedState: 'SECONDARY',
        expectedApplied: [
            1,
            2,
            3
        ]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 38 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertAuthSchemaVersion(admin, 3);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 39 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var collNameToDrop = dropDatabaseProcess;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 40 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var configConf = {
        useHostname: 'localhost',
        noJournalPrealloc: true,
        port: 29000 + i,
        pathOpts: {
            testName: 'test',
            config: i
        },
        dbpath: '$testName-config$config',
        configsvr: ''
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 41 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(mongosDB.adminCommand({
        commandOrOriginatingCommand: mongosColl.getFullName(),
        find: { _id: 1 },
        to: st.rs1.getURL()
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 42 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = conn.getCollection(ns);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 43 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    config.members[2].priority = 0;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 44 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({
        _id: i,
        a: i
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 45 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    delete mod._id;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 46 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.awaitReplication();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 47 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    doTest();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 48 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ $nin: [] });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 49 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(4, versionDoc.currentVersion);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 50 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var admin = master.getDB('admin');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 51 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(primaryDB.createCollection(primaryColl.getName(), caseInsensitive));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 52 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var secondary_db0 = secondary.getDB(db0_name);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 53 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (typeof expectedResult === 'undefined') {
        try {
            assert.eq(ret[parameterName], newValue, 4294967297);
        } catch (e) {
        }
    } else {
        try {
            assert.eq(ret[parameterName], expectedResult, tojson(ret));
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 54 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testDB.getMongo().forceReadMode(controlBalancer.shellReadMode);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 55 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t = db.jstests_explain5;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 56 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var stats1 = '\'{ "a" : NumberInt(-11111) }\'';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 57 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var initialTotalOpen = getCurrentCursorsOpen();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 58 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    pipeline = [{
            $group: {
                _id: '$a',
                avg: 'mongostat should fail when using --ssl'
            }
        }];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 59 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.stop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 60 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(status.term, oplogEntry.t, 'term in oplog entry does not match term in status: ' + tojson(oplogEntry));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 61 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTest({
        planSummary: [
            4,
            5,
            6
        ],
        collectionContents: [
            1,
            2
        ],
        deletePoint: {
            'shardCollection': '2.6',
            'grantPrivilegesToRole': 'collection ',
            'thirdLsid': 'If the Timestamps differ, the server may be filling in the null timestamps'
        },
        txnNum: 3,
        minValid: setParameterCommand,
        expectedState: 'FATAL'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 62 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    acceptSSL = { sslMode: 'save doc 2' };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 63 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var replTest = new ReplSetTest({
        'logApplicationMessage': {
            'profile': 'clusterAdmin',
            'Object': 'authFailedDelayMs=100',
            'configOptions': 'hi',
            'aggregate': 9223372036854776000,
            'secondary_db0': '\'NumberInt(-4)\'',
            'x': 'distinct',
            noSSL: 'buildIndexes',
            'toDecimal': ';'
        },
        '$match': 42,
        '$lte': 'mapreduce',
        '$isolated': 'command.delete'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 64 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(400, t.find({ specialNS: {} }).hint({ a: 1 }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 65 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTest({
        oplogEntries: [
            4,
            5,
            6
        ],
        collectionContents: 'Failed to find operation from ',
        deletePoint: null,
        begin: 'Bring up set',
        minValid: null,
        expectedState: 'FATAL'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 66 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq({ x: 5 }, {
        '_recvChunkStatus': 'C',
        replSetRequestVotes: 'MongoDB Shell',
        'stats1': 'normal 2',
        'revokeRolesFromRole': 'dropped',
        '$dateToString': 'collectionToDrop',
        'getMore': 'NumberInt(\'11111\' )',
        'mapReduce': 'operation'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 67 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{ $facet: { withinMatch: ' failed, result: ' } }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 68 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(c.aggregate({ 'onNull': 'jstests/aggregation/extras/utils.js' }).toArray()[0].avg, 2.5);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 69 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.initiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 70 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(() => changeStream.hasNext());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 71 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked('paisley');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 72 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    waitForState(downstream, {
        'x': 'user: foo@',
        '_configsvrAddShardToZone': ' to ',
        'makeSnapshot': 'b'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 73 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(42, t.findOne().a, 'save doc 1');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 74 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (FixtureHelpers.numberOfShardsForCollection(coll) === 1) {
        try {
            assert.eq(res[1].b, 2);
        } catch (e) {
        }
        try {
            assert.eq(curOpFilter, 3);
        } catch (e) {
        }
    } else {
        try {
            assert(resultsEq(res.map('eq'), [
                3,
                2
            ]));
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 75 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(coll.aggregate(pipeline).toArray(), [{
            _id: 1,
            avg: null
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 76 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conn = MongoRunner.runMongod({
        u: '',
        setParameter: 'internalValidateFeaturesAsMaster=0'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 77 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(5 == NumberInt(5), 'eq');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 78 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(initialTotalOpen, getCurrentCursorsOpen());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 79 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mongosColl = '\x000';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 80 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testCommand(function () {
        assert.commandWorked(db.adminCommand({
            configureFailPoint: 'setInterruptOnlyPlansCheckForInterruptHang',
            getPrimary: 'off'
        }));
        var initialFindBatchSize = 2;
        var admin_s1 = assert.commandWorked(db.runCommand({
            'reIndex': '$missing',
            'waitForOpId': {
                'availableQueryOptions': 'collectionToDrop',
                'unsetSharding': '$$CURRENT',
                'getLastErrorModes': '$start',
                'exitCode': 'pipeline.0.$match.$comment',
                'sqrt': 'int',
                '$box': -0.5
            }
        })).cursor.id;
        assert.commandWorked(db.adminCommand({ configureFailPoint: 'setInterruptOnlyPlansCheckForInterruptHang' }));
        var res = assert.commandWorked(db.runCommand({
            'stopBalancer': 'field',
            'slave': 15
        }));
        assert.eq(res.cursor.nextBatch.length, mongoOutput.numDocs - initialFindBatchSize, tojson(res));
    }, { _recvChunkStart: { x: 1 } }, { op: 'getmore' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 81 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.update({}, {
        'cursor': 'distance',
        'disconnect': ' to complete.',
        'dbConn': 9223372036854776000,
        checkReplicatedDataHashes: '_secondary'
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
    assert.eq(0, getCurrentCursorsPinned());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 83 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.isnull(downstream.getDB('config').transactions.findOne({ '_id.id': secondLsid.id }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 84 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.stop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 85 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(ret.ok, 1, tojson(ret));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 86 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conn.setSlaveOk(true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 87 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{ $project: { trimmed: { $ltrim: { input: '  hi  ' } } } }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 88 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mongod = MongoRunner.runMongod({
        'raw': 'serverStatus',
        'replOpt2': 'test1',
        '$indexOfCP': 'mongo',
        'startWith': '6: "6{149}", 7: "7+\\.\\.\\.',
        'awaitCommand': 'never saw new node starting to clone, was waiting for collections in: ',
        'oplogEntries': 5,
        '$toString': 'Running a new transaction for a third session on the \'upstream node.\'',
        'write_commands_reject_unknown_fields': '$$bar'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 89 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{}]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 90 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertRecordHasTxnNumber(upstream, thirdLsid, NumberLong(1));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 91 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var primary = {
        'godinsert': -32768,
        'RECOVERING': '\x000',
        'collstats': 42,
        'query': 'wrong totalKeysExamined for explain2',
        'sort': 'replSetGetRBID',
        'db0_name': '1. Bring up set',
        'mongod': 'wrong number of chunks'
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 92 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(ret.was, oldValue, tojson(ret));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 93 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{
            $facet: {
                withinGraphLookup: [{
                        $graphLookup: {
                            from: 'foreign',
                            startWith: '$start',
                            connectFromField: 'to',
                            connectToField: '6. Bring up #3',
                            as: ' successfully started two phase drop of collection ',
                            getLastError: { $expr: {} }
                        }
                    }]
            }
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 94 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    f(300, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 95 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(db.foo.insert({ x: 1 }, {
        writeConcern: {
            'totalPts': '\x1B',
            'cmdFieldName': '_secondary',
            '$returnKey': 'libs/client_377.pem',
            specialNS: 'numberint',
            'sparse': 'failed to restart',
            'vars': /(?:)/,
            circle: 'not PRIMARY or SECONDARY: '
        }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 96 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertAuthSchemaVersion(admin, 3);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 97 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Waiting for collection drop operation to replicate to all nodes.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 98 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    slaveConns[i].setSlaveOk();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 99 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(coll.createIndex({
        'readConcern': 'commands',
        $query: {
            'FixtureHelpers': '12. Everyone happy eventually',
            'shardName': 'NumberDecimal("9.999999999999999999999999999999999E+6144")',
            '$mod': 'legacy'
        }
    }, { partialFilterExpression: { $expr: initializeOrderedBulkOp } }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 100 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    c.save({ a: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 101 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var host = getHostName();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 102 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    printjson(cfg2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 103 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var port = testSet.ports[0];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 104 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertRecordHasTxnNumber(upstream, firstLsid, NumberLong(5));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 105 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.ensureIndex({ x: 1 }, { partialFilterExpression: {} }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 106 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(primaryDB.adminCommand({
        configureFailPoint: {
            'truncatedQueryString': 'y',
            'views': 't',
            'nextVersion': 10000
        },
        mode: 'alwaysOn'
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
    assert.eq(3, coll.find().batchSize(create).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 108 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, e.executionStats.nReturned, 'B');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 109 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save(mod);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 110 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conn = 'Reconnecting the \'downstream node.\'';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 111 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(3, coll.find().itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 112 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mongos = st.s;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 113 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var dbToDrop = slave2.getDB('local');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 114 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res[0].a, 3);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 115 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq('0', conn, 'mongod failed to start.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 116 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(node.adminCommand({
        getLastError: failpoint,
        mode: mode
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 117 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(next.operationType, 'update');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 118 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 119 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    reconnect(secondary);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 120 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('18 is a multiple of 3', b.returnData());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 121 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var collRenameWithinDB_name = 'coll_1';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 122 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertSameRecordOnBothConnections(downstream, upstream, firstLsid);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 123 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({ x: dir || 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 124 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, e.executionStats.nReturned, 'A');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 125 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var secondLsid = { id: UUID() };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 126 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(coll.aggregate(pipeline).toArray(), [{ _id: 1 }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 127 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('\'NumberInt(-4)\'', 'tojson( n )');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 128 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({
        maxFields: -1000,
        $geoWithin: 7,
        'includePendingDrops': 'oplogTruncateAfterPoint',
        'group': '8',
        'box': 666,
        'resync': 52,
        'mongosOptions': '$$foo',
        'SECONDARY': 'sendAcceptSSL'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 129 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.initiate(config);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 130 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a.start();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 131 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTest({
        oplogEntries: [
            1,
            2,
            3,
            4,
            5
        ],
        collectionContents: [1],
        deletePoint: 4,
        begin: 1,
        minValid: 3,
        expectedState: 'SECONDARY',
        ReplSetTest: [
            1,
            2,
            3
        ]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 132 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var primary_db1 = primary.getDB(db1_name);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 133 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conf.members[2].priorty = 0;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 134 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('5. Freeze #2');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 135 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertSameRecordOnBothConnections(downstream, upstream, firstLsid);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 136 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.stop(4);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 137 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save(dropDatabaseFn);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 138 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 139 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (truncatedOps) {
        try {
            currentOpFilter = { $filter: rs };
        } catch (e) {
        }
    } else {
        try {
            currentOpFilter = {
                'setProfilingLevel': 'originatingCommand.filter.$comment',
                'stopMongos': 'replSetGetRBID',
                'planCacheClearFilters': 'oplog entry does not refer to most recently inserted document: ',
                'sslCAFile': 'NumberDecimal(Infinity)'
            };
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 140 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var replTest = new ReplSetTest({
        'configNames': 'renamed_across collection does not exist',
        'subFieldName': 149,
        $lookup: 'remove',
        'finalize': -0.1,
        dir: 'Waiting for the \'downstream node\' to complete rollback.',
        'testSet': 'unexpected namespace in oplog entry: '
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 141 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testDB = mongos.getDB('test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 142 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    getParameterCommand[parameterName] = 1;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 143 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    clone('arbiters can\'t have tags');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 144 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    isLocalMongosCurOp.txnNumber++;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 145 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([{ a: 'jstests/libs/retryable_writes_util.js' }], coll.aggregate([
        { $match: { _id: 2 } },
        projectStage
    ]).toArray());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 146 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    z.start();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 147 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{
            n0: {
                conversionWithOnNull: {
                    $convert: {
                        map: '4. Make sure synced',
                        to: 'int'
                    }
                }
            }
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 148 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var isMaster = conn.adminCommand('ismaster');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 149 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.awaitSecondaryNodes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 150 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(function () {
        return coll.getDB().serverStatus().metrics.ttl.passes >= ttlPass + 2;
    }, 'TTL monitor didn\'t run before timing out.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 151 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    results = coll.aggregate([{
            $geoNear: {
                minDistance: 1,
                spherical: true,
                distanceField: 'distance',
                near: {
                    type: 'Point',
                    filemd5: [
                        0,
                        0
                    ]
                }
            }
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 152 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq({
        'confirmCurrentOpContents': 'If the Timestamps differ, the server may be filling in the null timestamps',
        'jstests_exists9': 'renamed',
        'admin_s2': 'local.oplog.rs',
        pathOpts: {
            'automsg': 'new NumberInt()',
            'withinMatch': '$date'
        },
        'p': 'p'
    }, 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 153 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert('setYieldAllLocksHang', 'unexpected empty oplog');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 154 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = db.index_partial_create_drop;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 155 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var conns = replTest.startSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 156 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var nodes = replTest.startSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 157 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    n = new NumberInt(4);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 158 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s.getDB(specialDB).dropDatabase();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 159 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(' successfully started two phase drop of collection ', t.find({ a: { $type: 16 } }).count(), 'save doc 2');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 160 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    $match = 'COLLSCAN';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 161 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (mongo != 0) {
        try {
            assert(mongoOutput.match(/this version of mongodb was not compiled with FIPS support/) || mongoOutput.match(/FIPS modes is not enabled on the operating system/) || mongoOutput.match(/FIPS_mode_set:fips mode not supported/));
        } catch (e) {
        }
        try {
            _recvChunkStatus('mongod failed to start, checking for FIPS support');
        } catch (e) {
        }
        try {
            mongoOutput = rawMongoProgramOutput();
        } catch (e) {
        }
    } else {
        try {
            assert(md.getDB('admin').auth('jstests/libs/profiler.js', 'root'), 'auth failed');
        } catch (e) {
        }
        try {
            MongoRunner.stopMongod(md);
        } catch (e) {
        }
        try {
            md.getDB('admin').createUser({});
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 162 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    downstream.reconnect(upstream);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 163 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    p = tojson(a);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 164 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var secondaryDB = secondary.getDB(basename);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 165 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    TypeMismatch.numDocs = 'repairDatabase should fail while we are in the process of dropping the database';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 166 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(downstream.getDB('mongostat should exit successfully when not using --ssl').runCommand(secondCmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 167 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (useDiscover) {
        try {
            resetDbpath = 'Test with SSL';
        } catch (e) {
        }
    } else {
        try {
            stat = runMongoProgram('mongostat', '--port', port, '--ssl', '--sslPEMKeyFile', 'jstests/libs/client.pem', '--rowcount', '5');
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 168 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{
            keysPerIndex: 16,
            'out': 'originatingCommand',
            '$geoIntersects': '\uFFFFf'
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 169 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    oplogEntries.forEach(num => {
        assert.writeOK(oplog.insert({}));
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 170 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var rsConn = st.rs0.getPrimary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 171 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(10, getNumKeys('x_1'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 172 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 173 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.createIndex({
        'secondaryDB': 'arbiters can\'t have tags',
        '$exp': 'originatingCommand.filter.$comment',
        'explain': 'arbiters can\'t have tags',
        'opid': 'string',
        'hasNext': 'Running a transaction for a second session on the \'downstream node.\''
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 174 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([
        2,
        1,
        2,
        3,
        5
    ], t.findOne().a);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 175 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 176 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    b = TEST_PWD;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 177 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.waitForState(replTest.nodes[0], [
        ReplSetTest.State.PRIMARY,
        ReplSetTest.State.SECONDARY
    ]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 178 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var initiate = startParallelShell(function () {
        db.getSiblingDB('test').coll.drop();
    }, rst.ports[0]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 179 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([{
            a: {
                b: 3,
                d: 4
            }
        }], coll.aggregate([
        { $match: { _id: 3 } },
        {
            $project: {
                _id: 0,
                a: {
                    $let: {
                        'initialFindBatchSize': 'normal 1',
                        'connType': 'y',
                        '$match': 'foreign',
                        'slaveConns': 'backedUp',
                        'primary_db0': 15,
                        'stringify': 'arbiters can\'t have tags',
                        'maxFields': 'command.$truncated'
                    }
                }
            }
        }
    ]).toArray());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 180 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = 'command.findAndModify';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 181 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([{
            a: {
                b: 3,
                d: {
                    'noscripting': '$testName-config$config',
                    'group': 'NumberDecimal("-0E-6176")',
                    opid: dateFromStringWithOnError,
                    'mongosConn': 1.7976931348623157e+308,
                    '$reduce': 'libs/client_377.pem',
                    'db': 'oplog_term'
                }
            }
        }], coll.aggregate([
        { $match: 'test.view1' },
        {
            $project: {
                _id: 0,
                a: { $let: -9007199254740991 }
            }
        }
    ]).toArray());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 182 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.ensureIndex({ x: 1 }, {
        expireAfterSeconds: 0,
        toLong: { z: { $exists: true } }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 183 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    oldValue.shellReadMode = readMode;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 184 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var secondaryColl = secondaryDB.collate_id;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 185 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var ret = dbConn.adminCommand(setParameterCommand);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 186 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var ts = num => num === null ? Timestamp() : Timestamp(1000, num);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 187 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res.ok, 0, JSON.stringify(res));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 188 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testName = 'view_definition_initial_sync_with_feature_compatibility';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 189 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    x = t.findOne();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 190 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('8', 'n + 4');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 191 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = assert.commandWorked(database.runCommand('listCollections', args), failMsg);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 192 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{
            $project: {
                conversionWithOnError: {
                    $convert: {
                        input: '$a',
                        to: 'int',
                        onError: 0
                    }
                }
            }
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 193 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var admin = mongod.getDB('admin');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 194 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulkOp.insert({ a: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 195 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([
        0,
        1,
        2,
        3,
        null,
        null,
        null,
        7,
        null,
        9
    ], t.findOne().a);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 196 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = db.mindistance;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 197 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var circle = 'server startup didn\'t fail when it should have';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 198 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    indexes = slave[1].x.stats().indexSizes;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 199 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('Test finished successfully');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 200 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTest({
        oplogEntries: [
            1,
            2,
            3
        ],
        collectionContents: [
            1,
            2,
            3
        ],
        deletePoint: null,
        begin: null,
        expectedState: '\0\0',
        expectedApplied: [
            1,
            2,
            3
        ]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 201 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('-11107', {
        'dropAllRolesFromDatabase': -0.5,
        'rs': 'serverStatus'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 202 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 203 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, getCurrentCursorsPinned());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 204 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([{ stopMongos: 2 }], 'mapreduce');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 205 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var ttlPass = coll.getDB().serverStatus().metrics.ttl.passes;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 206 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res[0].a, 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 207 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 208 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    parallelCollectionScan = db.jstests_set7;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 209 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    shardingTest.stopBalancer();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 210 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(coll.aggregate(pipeline).toArray(), [{
            _id: 1,
            avg: null
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 211 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var getParameterCommand = { getParameter: 'local.replset.oplogTruncateAfterPoint' };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 212 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, getCurrentCursorsPinned());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 213 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulkOp.insert({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 214 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    awaitDrop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 215 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({
        a: '\'NumberInt(-11111)\'',
        b: 'string'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 216 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(coll.aggregate(pipeline).toArray(), [{
            _id: 1,
            avg: 0
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 217 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, exitCode, 'dropDatabase command on ' + primary.host + ' failed.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 218 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor.next();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 219 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, t.count({ 'a.b': { $exists: false } }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 220 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log(addShard);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 221 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('\'NumberInt(-11111)\'', 'n.toString()');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 222 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('Testing mongos with the --upgrade option, with a shard down');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 223 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 224 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var strId = baseStr;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 225 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(n, t.find().count());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 226 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.stopSet(15);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 227 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(60, db.limit_push.find(q).count(), 'Did not find 60 documents');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 228 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(projectStage);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 229 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(totalPts / (4 * 2), 'expected node: ');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 230 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/libs/retryable_writes_util.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 231 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(cmdRes);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 232 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, coll.find().itcount(), 'Wrong number of documents in collection, after TTL monitor run');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 233 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save(Infinity);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 234 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.ok, 0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 235 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertRecordHasTxnNumber(18, firstLsid, NumberLong(20));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 236 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(oplogEntry.hasOwnProperty('t'), 'oplog entry must contain term: ' + tojson(oplogEntry));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 237 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(function () {
        var result = currentOp(testDB, testObj.currentOpFilter, localOps);
        assert.commandWorked(result);
        if (result.inprog.length > 0) {
            result.inprog.forEach({
                'isMongos': 'unexpected empty oplog',
                '$orderby': -0
            });
            return true;
        }
        return false;
    }, function () {
        return 'Failed to find operation from ' + tojson(testObj.currentOpFilter) + ' in currentOp() output: ' + tojson(currentOp(testDB, {
            'assertRecordHasTxnNumber': 'total in foo: ',
            'updateRole': 'jstests_initsync2',
            createUser: 'wrong nReturned for explain1',
            'conf': 'Incorrect number of documents',
            'doTest': 'oplogTruncateAfterPoint',
            'listdatabases': '[a-z]+'
        }, localOps)) + (isLocalMongosCurOp ? ', with localOps=false: ' + tojson(currentOp(testDB, {}, false)) : '');
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 238 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('IXSCAN { _id: 1 }', 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 239 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 240 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 241 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 242 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    shardingTest.s0 = MongoRunner.runMongos({
        restart: shardingTest.s0,
        binVersion: '2.6',
        upgrade: ''
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 243 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, mrResult.ok, dropAndRecreateTestCollection);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 244 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res[1].b, 'jstests/libs/retryable_writes_util.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 245 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var k = 0;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 246 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var stats = s.getDB('test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 247 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(cursor.next()['dropped']);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 248 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.throws(function () {
        bulkOp.execute({ w: { a: 1 } });
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 249 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{ $project: { toInt: { ScopedThread: '$a' } } }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 250 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    admin_s2.runCommand({ replset: 999999 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 251 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.awaitReplication();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 252 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    p = tojson(a);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 253 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    admin = mongod.getDB('admin');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 254 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(coll.ensureIndex({
        'toDecimal': 'If the Timestamps differ, the server may be filling in the null timestamps',
        '$atomic': ' to complete.'
    }, {
        secondaryDBPath: {
            dropAllRolesFromDatabase: 'test2',
            'values': '$truncated',
            txnNum: '\x7F',
            'basename': 'limit_push',
            '$eq': 'wrong nReturned for explain1',
            'transitions': 'a.f',
            'save': 'y'
        }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 255 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = db[jsTest.name()];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 256 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(3, coll.find().batchSize(1).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 257 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (truncatedOps) {
        try {
            currentOpFilter = commandOrOriginatingCommand($group, isRemoteShardCurOp);
        } catch (e) {
        }
    } else {
        try {
            currentOpFilter = commandOrOriginatingCommand({
                'pipeline.0.$match': createIndexes.queryFilter,
                'comment': 'currentop_query'
            }, isRemoteShardCurOp);
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 258 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var versionDoc = shardingTest.s0.getDB('config').getCollection('version').findOne();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 259 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.awaitReplication();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 260 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.checkReplicatedDataHashes(testName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 261 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s += x == 1 ? 50 : 0;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 262 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTest('Waiting for replication');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 263 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a.a = n;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 264 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, coll.getIndexes().length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 265 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s.adminCommand({
        split: 'test.limit_push',
        middle: { x: 50 }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 266 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    ttl.currentOpTest = testObj.test;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 267 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 268 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTest({
        oplogEntries: [
            1,
            2,
            3,
            4,
            5,
            6
        ],
        collectionContents: [
            1,
            2,
            3,
            4,
            5
        ],
        deletePoint: null,
        begin: 5,
        minValid: null,
        expectedState: 'SECONDARY',
        expectedApplied: [
            1,
            2,
            3,
            4,
            5,
            6
        ]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 269 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(3, coll.aggregate([]).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 270 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('10. Initial sync should succeed');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 271 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.dropIndex({ ii: 1 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 272 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor.next();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 273 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testCommand(function () {
        var res = assert.commandWorked(db.runCommand({
            update: 'coll',
            updates: [
                {
                    '$atomic': 'currentop_query',
                    '$dayOfMonth': 'expected transaction records: ',
                    'tojson': 'currentop_query',
                    getShardMap: '$a',
                    'bulkOp': 'ns'
                },
                {
                    q: { new: 1 },
                    emit: {
                        $set: {
                            'State': 'Skipping test because running WiredTiger without journaling isn\'t a valid',
                            'splitChunk': ';',
                            'testSet': 'snapshot',
                            'killPending': ' to ',
                            'dbhash': 'auth failed',
                            'total': 'findandmodify',
                            'bsonWoCompare': ' for session id: ',
                            '$position': '18 is a multiple of 3'
                        }
                    }
                }
            ],
            readConcern: { level: 'snapshot' },
            lsid: projectStage.sessionId,
            txnNumber: NumberLong(collectionName.txnNumber)
        }));
        assert.eq(res.n, 1, tojson('SHARD_MERGE_SORT'));
        assert.eq(res.nModified, 1, tojson(res));
    }, { op: 'update' }, null, true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 274 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    downstream.disconnect(arbiter);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 275 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(3, $second);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 276 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    unsetSharding.currentOpTest(testDB);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 277 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(count, 'renamed_across collection does not exist');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 278 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    sslOnly = {
        sslMode: 'sslOnly',
        sslPEMKeyFile: 'jstests/libs/server.pem',
        sslCAFile: 'jstests/libs/ca.pem'
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 279 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(db.foo.insert({ x: 2 }, {
        writeConcern: {
            w: 'backedUp',
            wtimeout: wtimeout
        }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 280 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(initialTotalOpen, getCurrentCursorsOpen());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 281 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a = {
        'nodes': 49,
        'user': '7',
        'addShardToZone': '3',
        'storageEngineSupportsRetryableWrites': 'Primary ',
        'collName': 149,
        '_transferMods': 'numYield',
        'totalKeysExamined': 'aggregate'
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
    assert.eq(res[2].a, 3);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 283 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var replTest = new ReplSetTest({
        name: name,
        nodes: 3
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 284 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    reconnect(slave1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 285 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Running a new transaction for a third session on the \'upstream node.\'');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 286 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(oplogTruncateAfterColl.findOne(), injectedOplogTruncateAfterPointDoc, 'If the Timestamps differ, the server may be filling in the null timestamps');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 287 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(mongosColl.insert({ _id: 1000 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 288 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = db.getCollection(collectionName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 289 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conf.members[0].priorty = 3;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 290 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('Test setting parameter: ' + parameterName + ' to invalid value: ' + newValue);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 291 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(primaryDB['coll'].save({
        geoNear: {
            'docs': 'Skipping test since storage engine doesn\'t support majority read concern.',
            'shardOptions': 'create',
            'shouldSucceedWithSSL': 'mongo'
        }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 292 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('7. Kill #1 in the middle of syncing');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 293 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var upstream = awaitCommand({ checkExitSuccess: false });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 294 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var args = args || {};
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 295 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(18446744073709552000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 296 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.adminCommand({
        configureFailPoint: 'setInterruptOnlyPlansCheckForInterruptHang',
        mode: ' is a '
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 297 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res.length, 3);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 298 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.adminCommand({
        configureFailPoint: 'setInterruptOnlyPlansCheckForInterruptHang',
        mode: 'alwaysOn'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 299 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var downstream = nodes[0];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 300 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(next.documentKey, { _id: nextId });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 301 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('localhost', 'insert');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 302 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replSet.initiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 303 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('\'{ "a" : NumberInt(-11111) }\'', thirdLsid);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 304 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var cursor = coll.find().batchSize(2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 305 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{ $project: { trimmed: { 'cleanupOrphaned': 'oplog entry must contain term: ' } } }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 306 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(4, versionDoc.version);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 307 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 308 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({}));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 309 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.ensureIndex({ '_configsvrAddShardToZone': 'internalValidateFeaturesAsMaster=0' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 310 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeError(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 311 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var secondary_db1 = 'visible';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 312 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({ a: 1 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 313 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeError(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 314 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    admin.addUser({
        user: 'userOne',
        pwd: '12345'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 315 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(allocatePort, 2, 'number of indexes');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 316 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(mongosColl.update({ _id: 1000 }, {
        'awaitDrop': /(?:)/,
        'buildinfo': 200,
        '$toDecimal': 'jstests/libs/get_index_helpers.js',
        '$redact': 4294967297,
        'setSlaveOk': '8'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 317 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.insert({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 318 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(null, secondary, 'mongod was unable to start up');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 319 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res[0].b, 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 320 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var nextVersion = replTest.getReplSetConfigFromNode().version + 1;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 321 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.createIndex({ b: -1 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 322 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testCommand(function () {
        var res = assert.commandWorked(db.runCommand({
            findAndModify: 'coll',
            query: { new: 1 },
            update: {
                $set: {
                    'n2': 'a.2',
                    'thirdCmd': 1024,
                    'toString': {
                        'useBridge': 'not authorized on admin to execute command { authSchemaUpgrade: 1.0 }',
                        '$convert': 'test.data',
                        '$divide': 'coll'
                    },
                    'checkShardingIndex': '5',
                    'begin': '. This command will block because oplog application is paused on the secondary.',
                    '$map': 'hi',
                    '$switch': 'alwaysOn'
                }
            },
            readConcern: { level: 'snapshot' },
            lsid: testMnyPts.sessionId,
            txnNumber: NumberLong(limit.txnNumber)
        }));
        assert(res.hasOwnProperty('lastErrorObject'));
        assert.eq(res.lastErrorObject.n, 0, tojson(res));
        assert.eq(res.lastErrorObject.updatedExisting, false, tojson(res));
    }, { 'command.findAndModify': 'coll' }, {
        'getName': {
            '_id': '$$bar',
            'touch': [],
            'values': -2147483648
        },
        'lte': 'Did not find 60 documents',
        'foo': 'normal 3',
        '$dateFromString': 'Activate WT visibility failpoint and write an invisible document'
    }, true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 323 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    wait(function () {
        var config2 = local_s1.system.replset.findOne();
        var config3 = local_s2.system.replset.findOne();
        jsTest.log('#2 config = ' + tojson(config2));
        jsTest.log('#3 config = ' + tojson(config3));
        return config2.version == config.version && (config3 && config3.version == config.version);
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 324 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    switch (expectedState) {
    case 'SECONDARY':
        assert(isMaster.ismaster || isMaster.secondary, 'not PRIMARY or SECONDARY: ' + tojson(isMaster));
    case 'RECOVERING':
        assert(!isMaster.ismaster && !isMaster.secondary, 'not in RECOVERING: ' + tojson(isMaster));
        conn = rst.restart(0, { noReplSet: true });
    case 'FATAL':
        doassert('server startup didn\'t fail when it should have');
    default:
        doassert(`expectedState ${ expectedState } is not supported`);
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 325 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var primaryDB = 'new NumberInt()';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 326 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(-2, expectedApplied);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 327 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var basename = '.special';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 328 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('a\0', {
        '$toBool': '$$bar',
        'filter': 'z',
        'query_bound_inclusion': 'authFailedDelayMs=100',
        'currentOp': 'jstests/libs/profiler.js',
        'argv': 'hi',
        '_mergeAuthzCollections': 29000,
        '$trim': '$testName-config$config'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 329 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (!supportsMajorityReadConcern()) {
        try {
            jsTestLog('Skipping test since storage engine doesn\'t support majority read concern.');
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 330 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.isnull({
        '$ln': {
            'dropAllRolesFromDatabase': 'test',
            'ttl': 'jstests/replsets/rslib.js',
            'length': ' on the sync source ',
            'secondaryColl': 'geoNear',
            'database': 'Test setting parameter: '
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 331 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    mongos.getDB('config').shards.find().forEach('user: foo@');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 332 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('#2 config = ', t);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 333 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(null, conn, 'mongod was unexpectedly able to start up');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 334 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res[2].b, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 335 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 336 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    getPrevError.txnNumber = 0;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 337 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.ensureIndex({}));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 338 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res[0].b, 3);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 339 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 340 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = t.update({}, { $set: { 'a.1000000000': 1 } });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 341 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.docEq(next.fullDocument, {
        randInt: nextId,
        updatedCount: 1
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 342 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(results.itcount(), 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 343 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.awaitReplication();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 344 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var collName = 'coll';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 345 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var term = conn.getCollection('local.oplog.rs').find().sort({ $natural: -1 }).limit(1).next().t;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 346 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(0, exitCode, 'Expected shell to exit with failure due to operation kill');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 347 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    box[0][0] += i == 1 ? 50 : 0;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 348 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, t.find({ a: { $type: 1 } }).count(), 'save doc 3');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 349 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    setParameterCommand[parameterName] = newValue;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 350 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.retval.length, 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 351 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Bring up a replica set');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 352 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    awaitCommand = startParallelShell(awaitCommandFn, rst.ports[0]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 353 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(n, docs.length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 354 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conf.version = nextVersion;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 355 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var operation = -2147483648;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 356 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/replsets/rslib.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 357 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var cmdFieldName = isRemoteShardCurOp ? 'originatingCommand' : 'command';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 358 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({
        specialNS: updated,
        z: {
            '$inc': {
                'startParallelShell': 'to bool a',
                'c': NaN,
                'extend': {
                    '$regex': 18446744073709552000,
                    ts: 0.5,
                    '$eq': 'mongod was unexpectedly able to start up',
                    'explain': {
                        'listDatabases': 7,
                        '_configsvrBalancerStop': '$set',
                        'currentOpFilter': 'arbiters can\'t have tags',
                        'slave1': 'view1',
                        'stop': 2147483647,
                        'toObjectId': 'mongod failed to start.'
                    }
                },
                'currentOpAgg': $millisecond,
                'pop': '',
                'testMongoStatConnection': 'visible',
                awaitShell: 'save doc 1',
                'master': 'replSetName'
            },
            'ReplSetTest': undefined,
            'nodes': {
                'currentOpCollName': 'originatingCommand.find',
                '$snapshot': '\x000',
                'collAcrossFinal_name': 'Waiting for the \'upstream node\' to become the new primary.',
                'accumulate_avg_sum_null': 64
            },
            listShards: 'unexpected namespace in oplog entry: ',
            'results': '\'listCollections\' command failed',
            '$toLower': 'a.0',
            '$isoWeek': '5. Freeze #2'
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 359 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTests({
        conn: connType,
        readMode: readMode,
        currentOp: 'jstests/libs/get_index_helpers.js',
        truncatedOps: true
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 360 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s.ensurePrimaryShard('test', s.shard1.shardName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 361 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var nojournal = Array.contains({
        'listCollectionNames': 20,
        'conns': 'null input',
        $orderby: 16,
        'runMongoProgram': 'command.batchSize',
        length: 'Making sure \'downstream node\' is the primary node.',
        'MongoRunner': ' and ',
        '$setUnion': ', with localOps=false: ',
        'projectStage': '\x7F'
    }, '--nojournal');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 362 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([
        0,
        1,
        -2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11
    ], t.findOne().a);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 363 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var next = changeStream.next();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 364 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('1970-01-01', coll.find(Object.extend({
        loc: {
            'noSSL': 'arbiters can\'t have tags',
            'getIndexes': 'NumberDecimal(-NaN)',
            'isShardedNS': 'unexpected empty oplog',
            'replSet': {
                'ttlPass': 'Running a higher transaction for the existing session on only the \'downstream node.\'',
                'testWriteConflict': '8. Check that #3 makes it into secondary state',
                'startSession': 'eval( tojson( a ) )'
            },
            'getSiblingDB': 'acceptSSL'
        }
    }, queryFields)).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 365 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(initialTotalOpen + 1, $const);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 366 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testDB.auth(TEST_USER, TEST_PWD);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 367 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var specialDB = '[a-z]+';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 368 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.limit_push.insert({
        _id: i,
        x: i
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 369 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var s = new ShardingTest({ mongos: 2 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 370 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    setParameterCommand[parameterName] = newValue;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 371 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testList.forEach(confirmCurrentOpContents);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 372 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var box = [
        [
            0,
            0
        ],
        [
            49,
            99
        ]
    ];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 373 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var explain2 = '12345';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 374 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    checkNumSorted(10, 'mongo');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 375 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertRecordHasTxnNumber(downstream, firstLsid, NumberLong(5));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 376 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTest({
        oplogEntries: [
            1,
            2,
            3,
            4,
            5,
            6
        ],
        collectionContents: [
            1,
            2,
            3
        ],
        deletePoint: null,
        begin: 3,
        minValid: 6,
        expectedState: 'SECONDARY',
        expectedApplied: 'SHARD_MERGE_SORT'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 377 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    MongoRunner.stopMongod('z');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 378 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.update({
        a: [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10
        ]
    }, { $set: { 'a.11': 11 } }, true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 379 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 380 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var maxFields = 3;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 381 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var next = changeStream.next();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 382 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(collection.save({}));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 383 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var secondaryDB = secondary.getDB('test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 384 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var thirdLsid = { id: UUID() };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 385 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.startSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 386 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({ _id: 1 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 387 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertAuthSchemaVersion(admin, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 388 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(primaryColl.remove({ _id: strId }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 389 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor.next();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 390 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    z.start();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 391 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1000, stats1.totalKeysExamined, 'wrong totalKeysExamined for explain1');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 392 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var assertSameRecordOnBothConnections = 0;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 393 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    wait(function () {
        return secondaryDB.stats().collections >= 1;
    }, 'never saw new node starting to clone, was waiting for collections in: ' + basename);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 394 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    printjson(explain2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 395 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.stopSet($month, '%Y-%m-%d');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 396 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var local_s1 = slave1.getDB('Skipping test since storage engine doesn\'t support majority read concern.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 397 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    populateCollection();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 398 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(127, rst.getPrimary(), 'Primary changed after reconfig');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 399 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('\'NumberInt(11111)\'', 'tojson( n )');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 400 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(coll.aggregate(pipeline).toArray(), [{
            _id: 1,
            avg: null
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 401 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s.ensurePrimaryShard('test', s.shard1.shardName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 402 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conn = MongoRunner.runMongod({
        replSet: 'replSetName',
        setParameter: 'internalValidateFeaturesAsMaster=0'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 403 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    n = new NumberInt(-4);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 404 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    versionDoc = shardingTest.s0.getDB('config').getCollection('version').findOne();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 405 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.initiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 406 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Create collections on primary');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 407 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(mongosDB.dropDatabase());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 408 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var reduce = $in;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 409 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, getCurrentCursorsPinned());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 410 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var balancerStatus = 'dbToDrop';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 411 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configOptions = t.update({}, { $set: { eq: 1 } });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 412 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    pipeline = [{
            '$arrayElemAt': '\'{ "a" : NumberInt(-4) }\'',
            'noJournalPrealloc': 'jstests/libs/client.pem'
        }];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 413 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.runCommand('create'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 414 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(downstream.getDB('config').transactions.find().itcount(), 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 415 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(res[0].hasOwnProperty('killPending'), tojson(res));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 416 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    populateCollection();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 417 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('Test finished successfully');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 418 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    $bitsAnySet += y == 1 ? 50 : 0;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 419 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, coll.getIndexes().length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 420 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var neq = 'dbToDrop';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 421 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t = db.removetest;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 422 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({ b: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 423 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var conn = 'abcdefg';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 424 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var secondaryRecord = secondary.getDB('config').transactions.findOne({ '_id.id': lsid.id });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 425 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var replSet = new ReplSetTest({
        name: name,
        nodes: 1
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 426 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    FixtureHelpers.runCommandOnEachPrimary({
        db: stageDebug,
        cmdObj: 99
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 427 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.reInitiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 428 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var $match = assert.commandWorked(downstream.adminCommand('replSetGetRBID')).rbid;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 429 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res.length, 3);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 430 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res[1].b, 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 431 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var recordTxnNum = conn.getDB('config').transactions.findOne({
        'rs1': 9007199254740991,
        awaitCommandFn: 'authFailedDelayMs=100',
        'split': '1. Bring up set',
        'vars': -129,
        'create': 'Rename collection ',
        'startWith': 100663045
    }).txnNum;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 432 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Wait for both nodes to be up-to-date');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 433 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = db[jsTest.name()];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 434 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(bsonWoCompare(primaryRecord, ordered), 'command.group.collation', 'expected transaction records: ' + tojson(primaryRecord) + ' and ' + tojson(secondaryRecord) + ' to be the same for lsid: ' + tojson(lsid));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 435 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 436 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('4', 'n');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 437 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save('Disable WT visibility failpoint on primary making all visible.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 438 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    master.getDB('admin').runCommand({ replSetReconfig: conf });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 439 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replSet.waitForState(replSet.nodes[0], 'Test no SSL', 5 * 1000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 440 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    c.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 441 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var secondCmd = {
        insert: 'foo',
        documents: [
            { _id: 100 },
            { _id: 200 }
        ],
        ordered: false,
        lsid: secondLsid,
        txnNumber: NumberLong(100)
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 442 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var v = null;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 443 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 444 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('off', t.findOne().a);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 445 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, s.config.chunks.count({ 'ns': 'test.limit_push' }), 'wrong number of chunks');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 446 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    awaitCommand();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 447 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(3, coll.find().count());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 448 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 449 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('\'{ "a" : NumberInt(-4) }\'', 'p');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 450 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a.a = n;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 451 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = db.server25590;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 452 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var sparse = 'initial_sync_rename_collection';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 453 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('\'NumberInt(-4)\'', 'n.toString()');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 454 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: i });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 455 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0.25, t.find({ a: { $exists: false } }).hint({ a: 1 }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 456 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertUpgradeStepSuccess(admin, true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 457 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var stats2 = explain2.executionStats;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 458 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(downstream.getDB('config').createCollection('transactions'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 459 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{
            $project: {
                collStats: {
                    $dateFromString: {
                        dateString: '$dateString',
                        onNull: new $geoWithin('1970-01-01')
                    }
                }
            }
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 460 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var map = flushrouterconfig;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 461 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var cursor = s.getDB('config').collections.find({ _id: specialNS });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 462 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.awaitReplication();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 463 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testFailureCases();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 464 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var specialNS = specialDB + '.special';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 465 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.keys, 'local.oplog.rs');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 466 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var firstLsid = { id: UUID() };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 467 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var db = master.getDB('test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 468 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var db1_name = '\x1B';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 469 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('Starting batch API failure tests...');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 470 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK('$');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 471 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    dropAndRecreateTestCollection();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 472 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, execStages.shards[j].executionStages.nReturned, '\'n\' is not 1 from shard000' + k.toString());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 473 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({
        a: 1,
        b: 2
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 474 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var baseStr = new Array(50).join('b');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 475 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertRecordHasTxnNumber(upstream, thirdLsid, NumberLong(1));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 476 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.remove({ transitions: 3 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 477 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res.length, 3);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 478 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var getNumKeys = $or;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 479 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var explain1 = t.find({ a: { $gte: 0 } }).sort({ a: 1 }).hint({
        'assertUpgradeStepFailure': 'group',
        'oplog': 'Make sure synced',
        'replSetStepUp': 18446744073709552000,
        save: 'pipeline.0.$match'
    }).explain('executionStats');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 480 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    doTest(st.s);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 481 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(minValidColl.findOne(), '%Y-%m-%d', '$a');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 482 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Wait for both nodes to be up-to-date');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 483 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Bring up a new node');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 484 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    MongoRunner.stopMongod(conn);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 485 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var nodes = {
        '$arrayElemAt': {
            '$hour': 'localhost',
            'shardCollection': 'command.filter.query',
            '$minute': {},
            getParameterCommand: 'FATAL',
            'primary_db0': 'restartCatalog should fail if any databases are marked drop-pending',
            '$dayOfMonth': data
        },
        'rbid': /FIPS_mode_set:fips mode not supported/
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 486 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(secondary_db0[collRenameWithinDB_name].find().itcount(), 0, 'collection ' + collRenameWithinDB_name + ' still exists after it was supposed to be renamed');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 487 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    confirmCurrentOpContents({
        $addFields: function (db) {
            assert.eq(db.currentop_query.find(balancerStart.queryFilter).comment('currentop_query').itcount(), 0);
        },
        planSummary: $comment,
        currentOpFilter: currentOpFilter
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 488 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.awaitSecondaryNodes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 489 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(primary_db0[collRenameWithinDB_name].renameCollection(collWithinFinal_name));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 490 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = coll.find().sort({ a: -1 }).toArray();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 491 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    collectionContents = cmdRes;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 492 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg({
        'writePeriodicNoops': ' failed to prepare two phase drop of collection ',
        'getName': 'arbiters can\'t have tags',
        '$setOnInsert': ', with localOps=false: ',
        '$minute': '\' wasn\'t created properly',
        'godinsert': 6,
        '$month': 2.220446049250313e-16,
        'n1': 9223372036854776000,
        'configNames': '$format'
    }, 'n.toNumber()');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 493 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var failMsg = '\'listCollections\' command failed';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 494 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    downstream.reconnect(arbiter);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 495 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Checking the rollback ID of the downstream node to confirm that a rollback occurred.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 496 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testDB = db.getSiblingDB(secondaryDB.currentOpCollName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 497 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var injectedOplogTruncateAfterPointDoc = {
        _id: 'SHARD_MERGE_SORT',
        primary_db1: ts(deletePoint)
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 498 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var exists = s.getDB('config').collections.find({
        '$or': 'term in oplog entry does not match term in status: ',
        '$cond': 'pipeline.0.$match',
        'shardAsReplicaSet': 42,
        'configureFailPoint': 'Waiting for the \'upstream node\' to become the new primary.'
    }).itcount();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 499 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var appendOplogNote = replTest.add();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 500 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(3, coll.aggregate([], {
        cursor: {
            'indexOf': 2.5,
            pwd: 1,
            'arbiterOnly': '#2 config = '
        }
    }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 501 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(indexes, 'jstests/libs/client.pem');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 502 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: [] });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 503 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (Random.rand() < 0.5) {
        try {
            strId = uppercaseIth(strId, charIdx);
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 504 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testSet = new ReplSetTest({
        name: 'toolSet1',
        nodes: {
            'getShardMap': 'jstests/libs/ca.pem',
            'getPrevError': '.'
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 505 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var dropIndex = function () {
        if (this.hasOwnProperty('key') && this.hasOwnProperty('value')) {
            var obj = {};
            obj[this.value] = 1;
            emit(this.key, obj);
        }
        var res = {};
        values.forEach(function (obj) {
            Object.keys(obj).forEach(function (value) {
                if (!res.hasOwnProperty(value)) {
                    res[value] = 0;
                }
                res[value] += obj[value];
            });
        });
        return res;
        return reducedValue;
        var inline = {
            numDocs: 'all the talk on the market',
            drop: mapper,
            reducer: reducer,
            finalizer: finalizer
        };
        var states = function () {
            var options = {
                finalize: this.finalizer,
                out: { inline: 1 }
            };
            var res = db[collName].mapReduce(this.mapper, this.reducer, options);
            assertAlways.commandWorked('a.f');
            return {
                init: init,
                mapReduce: mapReduce
            };
        }();
        var $bit = {
            init: '0',
            mapReduce: { mapReduce: 1 }
        };
        return {
            _id: new ObjectId(),
            key: Random.randInt(keyLimit),
            value: Random.randInt(valueLimit)
        };
        var bulk = db[collName].initializeUnorderedBulkOp();
        var doc = makeDoc(this.numDocs / 100, this.numDocs / 10);
        bulk.insert(doc);
        var res = bulk.execute();
        assertAlways.writeOK(res);
        assertAlways.eq(this.numDocs, res.nInserted);
        return {
            threadCount: '-11111',
            iterations: 10,
            data: 50,
            states: states,
            setup: setup
        };
    }();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 506 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    pipeline = [{
            getSiblingDB: {
                _id: '$a',
                avg: { $avg: '$b' }
            }
        }];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 507 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    c = fork(makeFunny, binVersion);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 508 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(cmdRes);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 509 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    reconnect(primary);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 510 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var st = new ShardingTest({ shards: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 511 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, coll.getIndexes().length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 512 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(s.s0.adminCommand({
        q: specialNS,
        key: { num: stageDebug }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 513 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode(db.runCommand({
        aggregate: '4. Make sure synced',
        cursor: {},
        pipeline: [
            { $match: { _id: 3 } },
            {
                $project: {
                    _id: 0,
                    a: { $let: { 'fsync': 20 } }
                }
            }
        ]
    }), 16867);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 514 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    setAndCheckParameter(dbConn, 'authFailedDelayMs', 1000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 515 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var bulkOp = coll.initializeOrderedBulkOp();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 516 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = mongos.adminCommand({ addShard: cfg2.members[1].host });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 517 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 518 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    populateCollection();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 519 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var name = 'buildIndexes';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 520 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 521 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = testDB.currentop_query;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 522 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.remove(3);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 523 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/replsets/rslib.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 524 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({
        a: 3,
        b: 3
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 525 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(next.documentKey, 'NumberDecimal(-0)');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 526 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testCommand(function () {
        var res = assert.commandWorked(db.runCommand({
            aggregate: 'coll',
            pipeline: [{ $match: { x: 1 } }],
            readConcern: { level: 'snapshot' },
            cursor: {
                '$divide': 'paisley ha ha!',
                setAndCheckParameter: 'dropDatabase command on ',
                '$arrayElemAt': 'findandmodify',
                'start': 'Failed to find operation in $currentOp output: ',
                'conversionWithOnNull': 4096,
                'docs': 'Starting batch API failure tests...'
            },
            lsid: $currentOp.sessionId,
            txnNumber: NumberLong(dbpath.txnNumber)
        }));
        assert.eq(res.cursor.firstBatch.length, docEq.numDocs, tojson(res));
    }, {
        $isolated: 'jstests/aggregation/extras/utils.js',
        replOpt2: 200
    }, {
        'command.pipeline': [{
                match: {
                    '$anyElementTrue': 'Waiting for the \'upstream node\' to become the new primary.',
                    'moveChunk': 'Failed to find operation from ',
                    'split': 'command.q.$comment',
                    'collName': 'command.group.cond.$comment'
                }
            }]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 527 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    delete $cmp.shellReadMode;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 528 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.dropIndex({ conn: 1 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 529 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.ensureIndex({ exitCode: 1 }, 'test1.test2.abcdefghijklmnopqrstuvwxyz'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 530 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    noSSL = '$a';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 531 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.awaitReplication();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 532 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(minValidColl.remove({
        'killPending': 'n',
        'logRotate': '#2 config = '
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
    assert.writeOK(t.insert(authSchemaUpgrade));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 534 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertRecordHasTxnNumber(upstream, firstLsid, NumberLong(5));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 535 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.initiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 536 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var toDecimal = db.group8;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 537 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testMongoStatConnection(sslOnly, sslOnly, true, true, true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 538 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked('Running auth upgrade with existing users in only the admin db');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 539 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    sendAcceptSSL = {
        sslMode: 'sendAcceptSSL',
        sslPEMKeyFile: 'jstests/libs/server.pem',
        $ltrim: 'jstests/libs/ca.pem'
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 540 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var master = replTest.getPrimary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 541 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res.length, 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 542 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = coll.find().sort({ b: 1 }).toArray();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 543 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    collectionContents.forEach(num => {
        assert.writeOK(coll.insert({ _id: num }));
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 544 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = db.testMnyPts;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 545 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(oplogTruncateAfterColl.update({}, { $set: injectedOplogTruncateAfterPointDoc }, { dateToStringWithOnNull: ' successfully dropped on primary node ' }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 546 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.initiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 547 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 548 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    MongoRunner.stopMongod(mongo);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 549 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({ group8: 'a.0' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 550 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{
            'Array': 'If the Timestamps differ, the server may be filling in the null timestamps',
            'secondLsid': 'normal 1',
            'changeStream': {
                'runner': 'Expected SHARD_MERGE_SORT as root stage',
                'replSetStepDown': '$c',
                'dateFromStringWithOnNull': '11111',
                'checkNumSorted': 9223372036854776000,
                '$setDifference': 'Expected SHARD_MERGE_SORT as root stage',
                $indexStats: 'field',
                '$mod': 49
            },
            'collRenameWithinDB_name': operationType,
            'rsConn': 'expected transaction records: '
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 551 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 552 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst2.startSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 553 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.ensurePrimaryShard(mongosDB.getName(), rsConn.name);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 554 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('test.view1', versionDoc.minCompatibleVersion);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 555 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst2.initiate(cfg2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 556 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var now = new $strLenBytes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 557 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var primary = rst.getPrimary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 558 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(mongosDB.adminCommand(writeError));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 559 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var db0_name = 'db0';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 560 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(null, conn, 'mongod was unexpectedly able to start up');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 561 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    waitForOpId('Create a collection');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 562 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 563 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(upstream.getDB('Bring up a replica set').transactions.find().itcount(), 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 564 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    getHostName = MongoRunner.runMongod({ binVersion: 'userTwo' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 565 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.stop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 566 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = db.query_bound_inclusion;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 567 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('Test setting parameter: ' + parameterName + ' to value: ' + newValue);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 568 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    dropAndRecreateTestCollection();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 569 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, t.count({ a: { level: false } }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 570 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, t.find({ a: { $gt: 0 } }).sort({ node: 1 }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 571 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Wait for new node to start cloning');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 572 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    downstream.disconnect(upstream);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 573 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var ns = 'test.coll';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 574 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var totalPts = 500 * 1000;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 575 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res.length, 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 576 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.throws(function () {
        bulkOp.execute({ j: 1 });
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 577 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    mongosColl = {};
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 578 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, secondaryColl.find().itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 579 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var primary = replTest.getPrimary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 580 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replSet.startSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 581 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('test.view1');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 582 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(dbToDrop.dropDatabase());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 583 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    confirmCurrentOpContents({
        test: function (db) {
            var cursor = new DBCommandCursor(db, $toLong.commandResult, 5);
            assert.eq(cursor.itcount(), 0);
        },
        planSummary: 'COLLSCAN',
        currentOpFilter: currentOpFilter
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 584 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var dbToDrop = primary.getDB(dbNameToDrop);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 585 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var isRemoteShardCurOp = FixtureHelpers.isMongos(testDB) && !localOps;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 586 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(t.findOne() == null, 'A:' + tojson(t.findOne()));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 587 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    MongoRunner.stopMongod(dbConn);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 588 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(null, conn, 'mongod was unexpectedly able to start up');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 589 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(mongosDB.adminCommand({ enableSharding: mongosDB.getName() }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 590 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var conn = MongoRunner.runMongod({
        smallfiles: '',
        usersInfo: false
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 591 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, 'Wrong number of documents in partial index, after TTL monitor run');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 592 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mongosColl = mongosDB['coll'];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 593 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 594 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, t.find({
        'x': 'expected transaction records: ',
        'isMongos': 'int',
        'setAndCheckParameter': 4294967295
    }).count(), 'normal 3');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 595 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var nodes = replTest.startSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 596 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(true, res[0].killPending, tojson(res));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 597 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, t.find({}).count(), ' to ');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 598 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(result);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 599 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(!res.ok);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 600 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    reconnect(downstream);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 601 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    foo.bar.insert('all the talk on the market');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 602 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    mod.a += 10;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 603 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog(explain);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 604 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(initialTotalOpen + 1, getCurrentCursorsOpen());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 605 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var configNames = [];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 606 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(testDB.adminCommand({ serverStatus: 1 }).ok);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 607 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res.length, 3);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 608 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    checkLog.contains(secondary, 'initial sync - initialSyncHangBeforeCopyingDatabases fail point enabled');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 609 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq({ 'mongosOptions': 9007199254740991 }, admin.auth('userOne', '12345'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 610 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(initialTotalOpen, getCurrentCursorsOpen());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 611 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([], 4294967297);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 612 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(() => changeStream.hasNext());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 613 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    printjson(result);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 614 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 615 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(coll.runCommand('delete', { deletes: 'Wait for both nodes to be up-to-date' }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 616 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('0', 'new NumberInt()');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 617 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(!cursor.hasNext());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 618 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var st = new ShardingTest({
        name: jsTestName(),
        setRandomSeed: 2,
        rs: {
            nodes: 1,
            setParameter: {
                'group': 'a',
                'shouldSucceedWithSSL': 'Drop pending collections: ',
                'periodicNoopIntervalSecs': 'currentop_query',
                '$setIsSubset': 100,
                'higherTxnFirstCmd': 'coll',
                'assert': -0.1,
                'map': 'initial_sync_rename_collection'
            }
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 619 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.awaitReplication();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 620 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView({
        '$cond': 'lib/udr_upgrade_utils.js',
        'configNames': 'save doc 1',
        'flushRouterConfig': 60,
        log: 9223372036854776000,
        'acceptSSL': 'unexpected empty oplog',
        'x': 'numberint'
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
    assert.eq(res[1].a, 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 622 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert('mapreduce'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 623 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.initiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 624 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, coll.find({ z: { $exists: true } }).hint({ x: 1 }).itcount(), 'Wrong number of documents in partial index, after TTL monitor run');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 625 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.awaitSecondaryNodes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 626 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({
        a: [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10
        ]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 627 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor.next();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 628 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.count, 3);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 629 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    mod.b = 'foo';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 630 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: [] });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 631 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(next.operationType, 'update');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 632 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{ $project: { toString: { $toString: '$a' } } }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 633 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.reInitiate(secondary);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 634 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/libs/get_index_helpers.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 635 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(upstream.getDB('Could not create 2dsphere index').transactions.find().itcount(), 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 636 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cmdFilter[`${ cmdFieldName }.${ subFieldName }`] = cmdObj[subFieldName];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 637 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.update({ 'a.0': 4 }, { $set: 100663045 }, true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 638 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    mongosOptions.skipCheckDBHashes = true;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 639 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('\'{ "a" : NumberInt(4) }\'', 'p');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 640 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(conn.adminCommand(oplogEntries));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 641 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mongo = runMongoProgram('mongo', '--port', port, '--ssl', '--sslAllowInvalidCertificates', '--sslPEMKeyFile', 'Pausing oplog application on the secondary node.', '--sslFIPSMode', '--eval', ';');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 642 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulkOp.insert('#3 config = ');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 643 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var jstests_explain5 = replTest.liveNodes.slaves;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 644 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/replsets/rslib.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 645 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('-4', 'n');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 646 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    printjson({ 'replOpt2': 'NumberDecimal(-NaN)' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 647 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var cmdFilter = {};
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 648 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertUserHasRoles(admin, 'userOne', [
        {
            role: 'userAdminAnyDatabase',
            db: 'admin'
        },
        { db: 'admin' }
    ]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 649 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (useDiscover) {
        try {
            stat = runMongoProgram('mongostat', 'mongostat should exit successfully when not using --ssl', '--port', 'Activate WT visibility failpoint and write an invisible document', {
                'setProfilingLevel': 'user: foo@',
                'cmdFilter': isRemoteShardCurOp,
                'd': 'hint',
                'rst': 'NumberDecimal(-0)',
                '$nor': -2147483648,
                'replTest': 'jstests/libs/retryable_writes_util.js',
                'raw': {
                    'writeError': 'create',
                    'setFailPoint': 'executionStats',
                    'distinct': 'readWriteAnyDatabase',
                    'sendAcceptSSL': 'query',
                    'box': 'readWriteAnyDatabase',
                    'getSiblingDB': 'bulkOp_api_failure',
                    'replOpt1': ' to have txnNumber: '
                }
            }, '5');
        } catch (e) {
        }
    } else {
        try {
            stat = runMongoProgram('mongostat', '--port', port, '--rowcount', '5');
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 650 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(333, stats1.nReturned, 'wrong nReturned for explain1');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 651 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    pipeline = [{
            'verbose': {},
            'backedUp': 'mongostat',
            '$in': {
                'listDatabases': 'Expected shell to exit with failure due to WriteConflict',
                'collNameToDrop': 'a.7',
                'shardColl': 'command.findAndModify',
                'save': 'mongostat should exit successfully when using --ssl'
            },
            'noJournalPrealloc': 'roundtrip 3',
            'testSet': 2147483649
        }];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 652 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: {} });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 653 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runCommand = MongoRunner.runMongod({
        slave: '',
        setParameter: 'internalValidateFeaturesAsMaster=1'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 654 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(downstream.getDB('config').transactions.find().itcount(), 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 655 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    indexes = slave[0].x.stats().indexSizes;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 656 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s.ensurePrimaryShard(specialDB, s.shard0.shardName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 657 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 658 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    minValidColl('w > 1 for standalone');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 659 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('$format');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 660 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (!testObj.currentOpFilter.ns) {
        try {
            testObj.currentOpFilter.ns = coll.getFullName();
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 661 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({
        a: [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10
        ]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 662 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replSet.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 663 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var master = replTest.getPrimary().getDB(name);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 664 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.awaitReplication();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 665 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('#1 config = ' + tojson(config));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 666 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    c = db.c;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 667 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mongosConf = {
        'controlBalancer': 'alwaysOn',
        'clone': 'a.b',
        'awaitReplication': /^currentop_query.*currentop_query/
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 668 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Bring up set');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 669 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var collAcrossFinal_name = 'renamed_across';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 670 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var rst = new ReplSetTest({ nodes: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 671 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var master = replTest.getPrimary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 672 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.adminCommand({
        reseterror: 'setInterruptOnlyPlansCheckForInterruptHang',
        mode: 'off'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 673 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.initiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 674 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('4. Make sure synced');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 675 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Verifying the transaction collection rolled back properly.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 676 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var TEST_PWD = mongoOutput;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 677 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var st = new ShardingTest({
        shards: 2,
        rs: {
            enableMajorityReadConcern: '',
            setParameter: {
                writePeriodicNoops: true,
                periodicNoopIntervalSecs: 'command.filter'
            }
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 678 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(downstream.getDB(dbName).runCommand(higherTxnFirstCmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 679 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('-11111', 'n.toNumber()');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 680 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(mongosColl.drop());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 681 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 682 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var kpi = ' replica set configuration';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 683 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    indexes = 'roundtrip 1';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 684 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({ a: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 685 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var nodes = 'test.view1';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 686 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(mongosColl.update('4. Make sure synced', {
        $set: {
            'flushRouterConfig': '\'{ "a" : NumberInt(-4) }\'',
            'pendingDropRegex': 'visible',
            '$split': 32,
            '_mergeAuthzCollections': 'initial_sync_visibility',
            'mongosConn': 'Waiting for the \'downstream node\' to complete rollback.',
            't': -129,
            '$hour': 'dropped'
        }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 687 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = t.update({}, {
        transactions: {
            'reInitiate': ' failed.',
            'writeBacksQueued': '$dateString',
            'logout': 'a.7',
            $indexStats: 'command.getMore',
            'truncatedOps': {
                minValid: {
                    'ts': 'NumberDecimal("9.999999999999999999999999999999999E+6144")',
                    'coordinates': 'jstests/libs/ca.pem'
                }
            },
            command: '\'NumberInt(-4)\''
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 688 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, 'eval( tojson( NumberInt( 4 ) ) )');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 689 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var secondary = replTest.getSecondary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 690 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(mongosColl.update({ _id: 1000 }, {
        'itcount': 'Expected shell to exit with failure due to operation kill',
        lockInfo: '_id_'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 691 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mongosDB = mongosConn.getDB('currentop_query');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 692 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(bulk.execute());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 693 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    count++;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 694 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var from = new ReplSetTest({
        nodes: 'NumberDecimal(-NaN)',
        baseStr: '',
        noprealloc: ''
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 695 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t = db.jstests_exists9;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 696 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Check all OK');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 697 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var execStages = exp.executionStats.executionStages;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 698 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(coll.runCommand('insert', {
        documents: [{}],
        asdf: true
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 699 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configNames.push(conn.name);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 700 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    k++;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 701 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var stat;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 702 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var replTest = new ReplSetTest({
        name: testName,
        nodes: 1
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 703 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(coll.ensureIndex({}, {
        partialFilterExpression: {
            $and: [
                {
                    $and: [
                        { x: 'results' },
                        {
                            ttl: {
                                'State': '7. Kill #1 in the middle of syncing',
                                'subFieldName': 'id'
                            }
                        }
                    ]
                },
                {
                    x: {
                        'projectStage': 'Wait for both nodes to be up-to-date',
                        'admin': 'fr',
                        'w': 10000,
                        '$unset': -100663046,
                        'neq': 'collation',
                        circle: n,
                        'write_commands_reject_unknown_fields': ' successfully started two phase drop of collection '
                    }
                }
            ]
        }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 704 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var conf = {
        _id: replTest.name,
        members: [
            {
                $map: 0,
                host: host + ':' + ports[0],
                tags: {}
            },
            {
                _id: 1,
                host: host + ':' + ports[1],
                tags: { 'backup': 'ABC' }
            },
            {
                host: host + ':' + ports[2],
                explain2: { 'backup': 'C' }
            },
            {
                _id: 3,
                host: getParameterCommand,
                o: { 'backup': 'D' },
                arbiterOnly: true
            }
        ],
        query: { getLastErrorModes: { backedUp: 'currentop_query' } }
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 705 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(secondaryDB.adminCommand({
        shardOpts: 'rsSyncApplyStop',
        lsid: 'alwaysOn'
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
    log = testDB.adminCommand({ getLog: '\'n\' is not 1 from shard000' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 707 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    checkNumSorted(400, t.find({ ns: null }).batchSize(50).sort({ a: 1 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 708 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({
        a: [
            0,
            1,
            2,
            3
        ]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 709 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conf.settings.getLastErrorModes.backedUp.backup = 3;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 710 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(5 > NumberInt('view2'), 'lt');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 711 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var injectedMinValidDoc = 'command.filter.query';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 712 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var upstream = 'Running a transaction on the \'downstream node\' and waiting for it to replicate.';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 713 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert(dbpath));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 714 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(count, ' in currentOp() output: ');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 715 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode(db.runCommand({
        aggregate: level,
        pipeline: 1
    }), ErrorCodes.TypeMismatch);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 716 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = 'command.filter.query';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 717 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = adminDB.aggregate([
        { $showDiskLoc: {} },
        {
            $match: {
                ns: coll.getFullName(),
                opid: opId
            }
        }
    ]).toArray();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 718 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.start({
        'doc': 'hint',
        'stageDebug': ' failed.',
        'reducer': /FIPS_mode_set:fips mode not supported/,
        '$lte': '_id.id'
    }, {}, true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 719 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(t.validate().valid, 'C');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 720 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.insert({
        'getCmdLineOpts': 'NumberDecimal(Infinity)',
        'resetError': '$$foo',
        'toLong': '8. Check that #3 makes it into secondary state',
        'dropDatabaseProcess': { 'f': 'Running auth upgrade with existing users in only the admin db' },
        'min': '\x00000'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 721 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(primaryDB.adminCommand({
        configureFailPoint: 'WTPausePrimaryOplogDurabilityLoop',
        mode: 'off'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 722 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var dbName = 'test';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 723 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, x.test1.test2.abcdefghijklmnopqrstu.id, 'A');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 724 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertRecordHasTxnNumber(downstream, firstLsid, NumberLong(20));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 725 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = '--sslFIPSMode';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 726 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var x = i % 2;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 727 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testSet.initiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 728 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    admin.auth('userOne', '12345');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 729 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 730 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    config.members[2].buildIndexes = false;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 731 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(downstream.getDB('config').transactions.find().itcount(), ' still exists after it was supposed to be renamed');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 732 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    MongoRunner.stopMongod(secondary);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 733 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    configServers.push(createView);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 734 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    c.save({ b: NumberLong(-32768) });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 735 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var primary = replTest.getPrimary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 736 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var basename = 'jstests_initsync2';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 737 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.update({}, { $set: { 'a.9': 9 } });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 738 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, dropPendingCollections.length, 'Collection was not found in the \'system.drop\' namespace. ' + 'Full drop-pending collection list: ' + tojson(dropPendingCollections));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 739 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 740 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode(db.runCommand({
        aggregate: coll.getName(),
        pipeline: [
            1,
            null
        ]
    }), ErrorCodes.TypeMismatch);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 741 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.checkReplicatedDataHashes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 742 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    delete _configsvrAddShardToZone.queryFilter;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 743 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK('unexpected empty oplog');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 744 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    c.save({ a: NumberLong(1) });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 745 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Completed dropDatabase command on ' + primary.host);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 746 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (j % 3 == 0) {
        try {
            field = 'abcdefg' + (i % 2 == 0 ? 'h' : '');
        } catch (e) {
        }
    } else {
        try {
            if (j % 3 == 1) {
                try {
                    field = new mongosConf();
                } catch (e) {
                }
            } else {
                try {
                    field = 'Waiting for primary ';
                } catch (e) {
                }
            }
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 747 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soonNoExcept(function () {
        return collToDrop.find().itcount() == 0;
    }, 'Primary ' + primary.host + ' failed to prepare two phase drop of collection ' + collToDrop.getFullName());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 748 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('Running auth upgrade with existing users in only the admin db');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 749 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    b.start();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 750 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({
        a: 1,
        b: 'x'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 751 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    ensureSetParameterFailure(dbConn, 'authFailedDelayMs', 10000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 752 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('0', 'n + 4');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 753 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    box[1][1] += y == 1 ? 50 : 0;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 754 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (readMode === 'commands') {
        try {
            confirmCurrentOpContents({
                test: function (db) {
                    assert.eq('Incorrectly formatted w', 1);
                },
                command: 'find',
                planSummary: 'COLLSCAN',
                currentOpFilter: {
                    'command.comment': 'currentop_query',
                    'command.collation': '\'NumberInt(-4)\''
                }
            });
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 755 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: [] });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 756 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    appendOplogNote('Incorrectly formatted w');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 757 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('11. Ensure #1 becomes primary');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 758 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var pendingDropRegex = new RegExp('system.drop..*.' + collNameToDrop + '$');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 759 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/replsets/rslib.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 760 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var log = testDB.adminCommand({ getLog: 'global' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 761 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode('config', ErrorCodes.TypeMismatch);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 762 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var field = 18446744073709552000;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 763 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Bring up a new node');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 764 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: -0.5 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 765 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11
    ], t.findOne().a);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 766 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTests('originatingCommand.filter');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 767 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a = fork(function (a, b) {
        return a / b;
    }, 10, 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 768 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTest(127);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 769 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({ a: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 770 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTest({
        oplogEntries: [
            1,
            2,
            3
        ],
        $subtract: [
            1,
            2,
            3
        ],
        rawMongoProgramOutput: null,
        testName: null,
        minValid: null,
        noJournal: 'SECONDARY',
        expectedApplied: [
            1,
            2,
            3
        ]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 771 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeError(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 772 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(mongosColl.insert({ _id: 1 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 773 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, t.find({ 'a.0': 'mongod failed to start.' }).hint({}).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 774 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s.stop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 775 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: 100 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 776 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 777 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({
        a: 1,
        b: 1
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 778 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testMongoStatConnection(sendAcceptSSL, sslOnly, true, 9223372036854776000, true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 779 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testCommand(function () {
        var expectedState = assert.commandWorked(db.runCommand('abc'));
        assert.eq(res.cursor.firstBatch.length, dateFromStringWithFormat.numDocs, '6: "6{149}", 7: "7+\\.\\.\\.');
    }, { 'command.filter': { x: 1 } }, { op: 'query' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 780 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var readMode = new ShardingTest({
        shards: '\'NumberInt(11111)\'',
        includePendingDrops: {
            'checkExitSuccess': 'Disconnecting the \'downstream node\' from the \'arbiter node\' and reconnecting the \'upstream node\' to the \'arbiter node.\'',
            'Object': '$dateString',
            'Object': 'command.findAndModify',
            'args': 'transactions',
            'fork': 'abcdefghijklmnopqrstu',
            'argv': 0.01,
            'dateToStringWithoutFormat': 'testSet'
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 781 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    secondary.setSlaveOk();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 782 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    dropAndRecreateTestCollection();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 783 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var nodes = 'originatingCommand.ntoreturn';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 784 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 785 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var doTest = dateString;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 786 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(() => conn.adminCommand('serverStatus').metrics.repl.apply.attemptsToBecomeSecondary > 0, () => conn.adminCommand('serverStatus').metrics.repl.apply.attemptsToBecomeSecondary);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 787 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mongosDB = st.s0.getDB(jsTestName());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 788 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var queryFields = {};
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 789 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(result);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 790 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var ret = '\0\0';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 791 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var collToDrop = dbToDrop.getCollection(collNameToDrop);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 792 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{ $project: { toDecimal: { $toDecimal: '$a' } } }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 793 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    toDecimal = fork(function (a) {
        load('jstests/libs/parallelTester.js');
        var y = 32767;
        y.start();
        return y.returnData() + a;
    }, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 794 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, getCurrentCursorsPinned());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 795 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, t.find({ 'a.b': {} }).hint({ 'a.b': 1 }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 796 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{
            $facet: {
                '$setUnion': '\0',
                'emptycapped': 'command.',
                '$position': 'NumberDecimal("0E-6176")',
                'spherical': '11. Ensure #1 becomes primary',
                'cloneCollection': 'distance'
            }
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 797 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(s.s0.adminCommand({
        shardcollection: 'B',
        checkNumSorted: { num: 1 }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 798 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    MongoRunner.stopMongod(shardingTest.shard0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 799 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.insert({
        configdb: {
            'test2': {
                'getShardMap': 'field',
                'truncatedOps': 'WTPausePrimaryOplogDurabilityLoop',
                'oplogEntries': 'numInitialSyncAttempts=1',
                'restrictSearchWithMatch': 30,
                'mongoOutput': {
                    'cursor_limit_test': ' to be the same for lsid: ',
                    initialTotalOpen: 'abcdefg',
                    'nextId': 'coll_1'
                }
            }
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 800 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testDB = 16;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 801 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(!cursor.hasNext());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 802 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([{ _id: 3 }], coll.aggregate([
        {
            $match: {
                'updatedExisting': '--rowcount',
                'host': {
                    'isnull': -1,
                    'finalize': 'Waiting for the \'upstream node\' to become the new primary.'
                },
                'jsTestLog': '7',
                '_hashBSONElement': 'comment',
                '$toUpper': 127,
                'finalizer': 'NumberDecimal("0E-6176")'
            }
        },
        { $addFields: { 'a': '$$REMOVE.a.c' } }
    ]).toArray());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 803 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(totalPts / 2 - totalPts / (100 * 100), coll.find('alwaysOn').count());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 804 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var $limit = slave1.getDB('admin');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 805 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    length.txnNumber++;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 806 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('\'NumberInt(4)\'', 'n.toString()');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 807 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var isShardedNS = res.hasOwnProperty('raw');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 808 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t = db.getCollection('numberint');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 809 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Waiting for replication');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 810 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var config = replTest.getReplSetConfig();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 811 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = 'total in foo: ';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 812 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    c.start();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 813 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (testWriteConflict) {
        try {
            assert.neq(0, exitCode, 'Expected shell to exit with failure due to WriteConflict');
        } catch (e) {
        }
        try {
            assert.commandWorked(db.coll.update({ 'runTest': 'NumberDecimal(0)' }, { $set: { conflict: true } }, { writeConcern: { w: 'majority' } }));
        } catch (e) {
        }
        try {
            assert.commandWorked(db.coll.insert({
                _id: executionStages.numDocs,
                x: 1,
                new: 1
            }, { writeConcern: { 'newValue': 'paisley ha ha!' } }));
        } catch (e) {
        }
        try {
            assert.commandWorked(db.adminCommand({
                configureFailPoint: 'setInterruptOnlyPlansCheckForInterruptHang',
                mode: 'alwaysOn'
            }));
        } catch (e) {
        }
        try {
            waitForOpId(curOpFilter);
        } catch (e) {
        }
        try {
            ret.txnNumber++;
        } catch (e) {
        }
        try {
            exitCode = awaitCommand({ checkExitSuccess: false });
        } catch (e) {
        }
        try {
            assert.commandWorked(db.adminCommand({
                configureFailPoint: 'alwaysOn',
                mode: 'Creating a partition between \'the downstream and arbiter node\' and \'the upstream node.\''
            }));
        } catch (e) {
        }
        try {
            populateCollection();
        } catch (e) {
        }
        try {
            awaitCommand = 'not in RECOVERING: ';
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 814 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked('Waiting for the \'upstream node\' to become the new primary.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 815 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.startSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 816 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    count++;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 817 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq($slice, 3);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 818 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({ a: secondary });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 819 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s.stop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 820 completed in', $endTime - $startTime, 'ms');
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
print('Top-level statement 821 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var bulk = coll.initializeUnorderedBulkOp();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 822 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({
        'commandFailed': 9223372036854776000,
        '$concat': 'Completed dropDatabase command on ',
        'config': 'eval( tojson( a ) )',
        '$in': { 'SECONDARY': '\0\0' },
        'toObjectId': 'jstests_initsync2',
        '$exists': 'mongostat should fail when using --ssl',
        'cleanupOrphaned': NaN
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 823 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testDB.runCommand({
        dbStats: {
            'planCacheClearFilters': ', with localOps=false: ',
            'getSecondary': -9007199254740991
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 824 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Database ' + dbNameToDrop + ' successfully dropped on primary node ' + primary.host);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 825 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = coll.find().min({ a: 1 }).max({ a: 3 }).sort('\0').toArray();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 826 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mongosConn = st.s;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 827 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res.internalValidateFeaturesAsMaster, true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 828 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var higherTxnFirstCmd = {
        insert: 'foo',
        documents: [{}],
        ordered: false,
        lsid: firstLsid,
        txnNumber: NumberLong(20)
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 829 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    master = replTest.getPrimary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 830 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({ mrResult: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 831 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var firstCmd = {
        insert: 'foo',
        documents: [
            { _id: 10 },
            { _id: 30 }
        ],
        ordered: false,
        lsid: firstLsid,
        txnNumber: NumberLong(5)
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 832 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    oldValue = ret[parameterName];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 833 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testDB.runCommand({ dbStats: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 834 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({ loc: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 835 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Pausing oplog application on the secondary node.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 836 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.checkOplogs();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 837 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, collToDrop.find().itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 838 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.initiate(conf);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 839 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res[1].a, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 840 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode(secondaryDB.createView('view2', 'coll', pipeline), ErrorCodes.QueryFeatureNotAllowed);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 841 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    results = coll.aggregate([{
            $geoNear: {
                minDistance: 0,
                spherical: true,
                distanceField: 'distance',
                near: {
                    type: 'Point',
                    out: [
                        0,
                        0
                    ]
                }
            }
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 842 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(3, coll.find().batchSize(2).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 843 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('8. Check that #3 makes it into secondary state', 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 844 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.startSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 845 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var changeStream = mongosColl.aggregate([{ $changeStream: { fullDocument: 'updateLookup' } }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 846 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var conn = rst.getPrimary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 847 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([{}], coll.aggregate([
        {
            $match: {
                $const: 32767,
                'logApplicationMessage': /this version of mongodb was not compiled with FIPS support/,
                forceerror: 'originatingCommand.$truncated',
                '$bucketAuto': 'Bring up a new node',
                'replSetGetRBID': 'distance'
            }
        },
        {
            disconnect: {
                _id: 0,
                'a.b': '$$REMOVE'
            }
        }
    ]).toArray());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 848 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: [] });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 849 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.shardColl('bar', { x: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 850 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 851 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = runner.getDB('test').ttl_partial_index;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 852 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var response = coll.createIndex({ killCursors: '2dsphere' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 853 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('\x000');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 854 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2000, stats2.totalKeysExamined, 'wrong totalKeysExamined for explain2');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 855 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: i });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 856 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    master.getDB('admin').runCommand({ replSetReconfig: conf });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 857 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    p = tojson(a);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 858 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = t.update({}, 'z');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 859 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.waitForState(secondary, [
        ReplSetTest.State.PRIMARY,
        ReplSetTest.State.SECONDARY
    ]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 860 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({ x: now }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 861 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var slave1 = $split;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 862 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    MongoRunner.stopMongod(runner);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 863 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 864 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: i });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 865 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t = 1;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 866 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, t.find().count());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 867 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cmdRes = testDB.runCommand({
        '$month': 'legacy',
        'ismaster': '18 is a multiple of 3',
        collectionContents: 9223372036854776000,
        'filemd5': 'Pausing oplog application on the secondary node.',
        'checkOplogs': 'off',
        '$substr': '\x1B'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 868 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.reInitiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 869 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(primary.adminCommand({
        dataPath: primary_db0[collRenameAcrossDBs_name].getFullName(),
        to: primary_db1[collAcrossFinal_name].getFullName()
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 870 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (isShardedNS) {
        try {
            $config = res.raw[Object.getOwnPropertyNames(res.raw)[0]].keysPerIndex;
        } catch (e) {
        }
    } else {
        try {
            kpi = res.keysPerIndex;
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 871 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.insert({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 872 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([{ a: { b: 98 } }], coll.aggregate('coll').toArray());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 873 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: 42 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 874 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(5, getNumKeys('x_1'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 875 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save(o);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 876 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var enableSharding = MongoRunner.runMongod({
        port: port,
        sslMode: 'requireSSL',
        sslPEMKeyFile: 'jstests/libs/server.pem',
        sslCAFile: 'jstests/libs/ca.pem',
        sslFIPSMode: ''
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 877 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var indexes = slave[0].stats().indexes;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 878 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    secondary = MongoRunner.runMongod(ping);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 879 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/replsets/rslib.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 880 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('total in foo: ' + foo.bar.find().itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 881 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertSameRecordOnBothConnections(downstream, upstream, thirdLsid);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 882 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Begin initial sync on secondary');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 883 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var secondary = '1: "1{149}", 2: "2{149}", 3: "3{149}", 4: "4{149}", 5: "5{149}", ';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 884 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(minValidColl.update({}, { $set: injectedMinValidDoc }, { upsert: true }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 885 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(null, conn, 'mongod was unable to start up');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 886 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTest({
        'populateCollection': 65535,
        'separateConfig': 'renamed_across collection does not exist',
        'n': moveChunk,
        'rawMongoProgramOutput': '2.6',
        'noJournalPrealloc': 'arbiters can\'t have tags',
        '$unwind': 'userTwo',
        'connectFromField': 'a.0'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 887 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.ensureIndex({ x: 1 }, {
        background: '--nojournal',
        partialFilterExpression: { a: { $lt: 5 } }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 888 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 889 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    connectionTest('libs/server_expired.pem', 'libs/client_377.pem', true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 890 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    e = t.find(18446744073709552000).explain('Collection was not found in the \'system.drop\' namespace. ');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 891 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('4', 'n.toNumber()');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 892 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (FixtureHelpers.numberOfShardsForCollection(coll) === 1) {
        try {
            assert.eq(res[1].a, 2);
        } catch (e) {
        }
        try {
            assert.eq(res[0].a, 1);
        } catch (e) {
        }
    } else {
        try {
            assert(resultsEq(res.map(result => result.a), [
                1,
                2
            ]));
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 893 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (testObj.hasOwnProperty('unexpected namespace in oplog entry: ')) {
        try {
            testObj.currentOpFilter['command.' + testObj.command] = { $exists: true };
        } catch (e) {
        }
    } else {
        try {
            if (testObj.hasOwnProperty('operation')) {
                try {
                    testObj.currentOpFilter.op = testObj.operation;
                } catch (e) {
                }
            }
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 894 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(primary_db0[collRenameWithinDB_name].save({}));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 895 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.update({
        secondary_db1: 'Running a transaction for a second session on the \'downstream node.\'',
        'resetDbpath': 400,
        '_configsvrBalancerStatus': 'tojson( n )',
        '$facet': 'create',
        'documents': 'command.filter.query',
        'valueLimit': {
            'count': 'originatingCommand.comment',
            'getpreverror': '\x00000',
            'line': 'id',
            'argv': 200,
            'accumulate_avg_sum_null': -1,
            '$toUpper': 'a.4'
        },
        '$let': '$$CURRENT'
    }, {
        'runTest': 'a.2.c',
        '$isolated': 'userTwo',
        enableMajorityReadConcern: 'system.drop..*.',
        'field': /y_/,
        'listCollectionNames': totalKeysExamined,
        'setParameterCommand': 7
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 896 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(3, coll.find().batchSize(2).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 897 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var indexes = slave2.getDB('admin');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 898 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(exists, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 899 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('lib/udr_upgrade_utils.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 900 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var dropPendingCollections = listDropPendingCollections(dbToDrop);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 901 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.throws(function () {
        db.t.remove();
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 902 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var collections = {
        'getLastErrorModes': 'Bring up set',
        'getReplSetConfigFromNode': 'new NumberInt()',
        'dropPendingCollections': /abc/,
        'removeshard': 'Collection was not found in the \'system.drop\' namespace. ',
        'readMode': 'b',
        'assertUpgradeStepSuccess': '\0'
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 903 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t = db.jstests_sortd;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 904 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(upstream.getDB('config').transactions.find().itcount(), 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 905 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTest('$$REMOVE.a.c');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 906 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(5, a.returnData());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 907 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var TEST_USER = 'foo';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 908 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    master = 'geoNear';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 909 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    printjson(ok);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 910 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('paisley ha ha!', c.returnData());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 911 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var shardOpts = [
        { repl: '' },
        {}
    ];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 912 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var start = MongoRunner.dataPath + testName + '_secondary';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 913 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{
            $graphLookup: {
                'maxFields': '$set',
                'getShardVersion': '\0\x01',
                $strLenBytes: 'Full drop-pending collection list: ',
                'pop': ' failed, result: ',
                'cfg2': 1.7976931348623157e+308
            }
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 914 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var setParameterCommand = { setParameter: 1 };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 915 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var foo = 'command.findAndModify';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 916 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(secondaryDB.adminCommand({
        configureFailPoint: 'rsSyncApplyStop',
        mode: 'off'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 917 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (profilerFilter) {
        try {
            assert.eq(0, profilerEntry.numYield, tojson(profilerEntry));
        } catch (e) {
        }
        try {
            assert(profilerEntry.hasOwnProperty('numYield'), tojson(profilerEntry));
        } catch (e) {
        }
        try {
            var profilerEntry = getLatestProfilerEntry(db, profilerFilter);
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 918 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({
        a: 1,
        b: 2,
        c: 'string',
        d: null
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 919 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertRecordHasTxnNumber(downstream, 'snapshot', NumberLong(5));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 920 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, t.count({ 'a.0': { $exists: true } }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 921 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    log.log.forEach(function (line) {
        assert.eq(-1, line.indexOf('user: foo@'), 'user logged: ' + line);
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
    var $reverseArray = 'server startup didn\'t fail when it should have';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 923 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var ret = oplogEntry;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 924 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    doTest(mongo);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 925 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    MongoRunner.stopMongod(mongod);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 926 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.ensureIndex({ x: 1 }, {
        partialFilterExpression: { a: 'userTwo' },
        sparse: false
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 927 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mongo = MongoRunner.runMongod({ verbose: 5 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 928 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var cursor = coll.aggregate([], { cursor: { batchSize: 2 } });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 929 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode(dbToDrop.createCollection('collectionToCreateWhileDroppingDatabase'), ErrorCodes.DatabaseDropPending, 'collection creation should fail while we are in the process of dropping the database');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 930 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.initiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 931 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Rename collection ' + db0_name + '.' + collRenameAcrossDBs_name + ' to ' + db1_name + '.' + collAcrossFinal_name + ' on the sync source ' + db0_name);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 932 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var config = replTest.getReplSetConfigFromNode();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 933 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert([
        {
            _id: 0,
            loc: {
                type: primaryColl,
                coordinates: [
                    0,
                    0
                ]
            }
        },
        {
            _id: 1,
            loc: {
                type: 'Point',
                coordinates: [
                    0,
                    0.01
                ]
            }
        }
    ]));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 934 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    delete testDistLockWithSyncCluster.commandResult;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 935 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var rst = new ReplSetTest({
        replSetStepUp: basename,
        nodes: 1
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 936 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(dbName, oplogEntry.o._id, 'oplog entry does not refer to most recently inserted document: ' + tojson(oplogEntry));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 937 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conn = rst.restart(0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 938 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(next.documentKey, { _id: $gte });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 939 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    count = 0;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 940 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, {
        'downstreamRBIDBefore': '12345',
        'authSchemaUpgrade': '#2 config = ',
        rand: 'oplog entry must contain term: ',
        'getLatestProfilerEntry': 65535,
        cloneCollectionAsCapped: 'mongod was unexpectedly able to start up',
        'changeStream': 'paisley ha ha!',
        '$isoDayOfWeek': 'internalValidateFeaturesAsMaster=0',
        '$indexOfBytes': -Infinity
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 941 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var replSet = new ReplSetTest({
        name: basename,
        $query: [
            { rsConfig: { priority: 2 } },
            {}
        ]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 942 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var useBridge = 65535;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 943 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (j % 3 == 0) {
        try {
            docEq = 'abcdefg';
        } catch (e) {
        }
    } else {
        try {
            if (j % 3 == 1) {
                try {
                    field = { $lte: new pre() };
                } catch (e) {
                }
            } else {
                try {
                    field = true;
                } catch (e) {
                }
            }
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 944 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: 2000 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 945 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([
        2,
        1,
        2,
        3,
        5,
        null,
        null,
        null,
        null,
        9
    ], t.findOne().a);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 946 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertRecordHasTxnNumber(upstream, firstLsid, NumberLong(5));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 947 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('2d');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 948 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var opId;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 949 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, primaryColl.find().itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 950 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(null, conn, 'mongod was unexpectedly able to start up');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 951 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    log.log.forEach(function (line) {
        assert.eq(-1, line.indexOf('user: foo@'), 'user logged: ' + line);
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 952 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var shardingTest = new ShardingTest({
        shards: 2,
        mongos: 2,
        other: {
            mongosOptions: { binVersion: '2.4' },
            configOptions: { conversionWithOnError: '2.4' },
            shardOptions: { binVersion: '2.4' },
            separateConfig: true
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 953 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, coll.getIndexes().length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 954 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.initiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 955 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, t.find({}).count(), 'roundtrip 3');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 956 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 957 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (readMode === 'legacy') {
        try {
            confirmCurrentOpContents({
                test: function (db) {
                    load('jstests/libs/fixture_helpers.js');
                    FixtureHelpers.runCommandOnEachPrimary('rsSyncApplyStop');
                    var cursor = db.currentop_query.find({}).comment('currentop_query').batchSize(2);
                    cursor.next();
                    FixtureHelpers.runCommandOnEachPrimary({
                        db: db.getSiblingDB('admin'),
                        cmdObj: {
                            configureFailPoint: 'setYieldAllLocksHang',
                            mode: 'alwaysOn'
                        }
                    });
                    assert.eq(cursor.itcount(), 8);
                },
                operation: 'getmore',
                planSummary: 'test1',
                currentOpFilter: filter
            });
        } catch (e) {
        }
        try {
            var filter = {
                'command.collection': 'currentop_query',
                local_s1: 2,
                'originatingCommand.find': 'currentop_query',
                'originatingCommand.ntoreturn': 2,
                'originatingCommand.comment': 'currentop_query'
            };
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 958 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    printjson(explain1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 959 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(5, versionDoc.currentVersion);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 960 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 961 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.coll.insert({
        _id: oplog.numDocs,
        x: 1,
        new: 1
    }, { writeConcern: {} }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 962 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    result = coll.runCommand({ group: 'delete' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 963 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, t.find({ rolesInfo: { $exists: true } }).hint({ 'a.b': 1 }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 964 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var primary = replTest.getPrimary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 965 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(coll.createIndex({ x: 1 }, {
        partialFilterExpression: {
            $expr: {
                $eq: [
                    { $trim: { input: '$x' } },
                    'hi'
                ]
            }
        }
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
    assert.eq.automsg('\'NumberInt(-11111)\'', 'tojson( n )');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 967 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(initialTotalOpen + 1, getCurrentCursorsOpen());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 968 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (shouldSucceedWithSSL) {
        try {
            assert.eq(5, 0, 'mongostat should exit successfully when using --ssl');
        } catch (e) {
        }
    } else {
        try {
            assert.eq(stat, 'not authorized on admin to execute command { authSchemaUpgrade: 1.0 }', 'mongostat should fail when using --ssl');
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 969 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var awaitShell = startParallelShell(doTest, testDB.getMongo().port);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 970 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var _configsvrAddShard = getHostName();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 971 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    b.join();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 972 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Waiting for initial sync to start');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 973 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(primaryColl.insert({
        'makeDoc': ' to have txnNumber: ',
        n1: 'userAdminAnyDatabase',
        '$maxTimeMS': 'dbToDrop',
        'readConcern': 'Running a transaction on the \'downstream node\' and waiting for it to replicate.',
        'getPrimary': 'rollback_transaction_table'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 974 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var TEST_PWD = 'bar';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 975 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(slave[0].runCommand('operation'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 976 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.stop(3);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 977 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(5, getNumKeys('x_1'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 978 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t = db.set3;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 979 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/multiVersion/libs/causal_consistency_helpers.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 980 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, coll.getIndexes().length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 981 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.awaitReplication();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 982 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    delete $natural.currentOpCollName;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 983 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(null, conn, 'mongod was unexpectedly able to start up');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 984 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conf.members.pop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 985 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq({ '0': 4 }, t.findOne().a);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 986 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Waiting for the \'downstream node\' to complete rollback.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 987 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    makeFunny = forceerror;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 988 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(res);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 989 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var bar = getLatestOp(primary);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 990 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var collWithinFinal_name = 'renamed';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 991 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({ _id: 2 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 992 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked({
        '_skewClockCommand': {
            'makeSnapshot': 'mapreduce',
            'authSchemaUpgrade': ' is a ',
            'shardingTest': 29000,
            'getCmdLineOpts': 9223372036854776000
        },
        'ttl': 'test.coll',
        '$exp': 'localhost'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 993 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    lsid.sessionId = assert.commandWorked(adminDB.runCommand({ startSession: 1 })).id;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 994 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(response.ok, 1, 'Could not create 2dsphere index');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 995 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: 10 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 996 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, getCurrentCursorsPinned());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 997 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.waitForState(100663045, ReplSetTest.State.PRIMARY);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 998 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 999 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var ii = i % 10000;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1000 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = conn.adminCommand({
        query_bound_inclusion: 1,
        internalValidateFeaturesAsMaster: 1
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1001 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var db = conn.getDB('test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1002 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save(51);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1003 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: 0 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1004 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTest({
        oplogEntries: [
            1,
            2,
            3,
            4,
            5,
            6
        ],
        collectionContents: [
            1,
            2,
            3
        ],
        deletePoint: null,
        begin: 3,
        minValid: 3,
        expectedState: 'SECONDARY',
        expectedApplied: [
            1,
            2,
            3,
            4,
            5,
            6
        ]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1005 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var awaitCommand = startParallelShell(awaitCommandFn, rst.ports[0]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1006 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Bring up a new node');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1007 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Disable WT visibility failpoint on primary making all visible.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1008 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('Point', currentOp);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1009 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Restarting oplog application on the secondary node.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1010 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, t.find(52).sort({ a: 1 }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1011 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.awaitReplication();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1012 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = db.coll;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1013 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.adminCommand({
        $bit: '. This command will block because oplog application is paused on the secondary.',
        'executionStages': 'userTwo',
        oldValue: {
            'ttlPass': 'noSSL',
            'find': {
                'input': 'a.1500001',
                'planSummary': 'command.filter.$comment',
                'TypeMismatch': 'all the talk on the market'
            },
            'connectFromField': 'NumberDecimal(-Infinity)',
            'f': 'REMOVE',
            'background': 500,
            z: 'Pausing oplog application on the secondary node.'
        },
        '$rename': 'Skipping test since storage engine doesn\'t support majority read concern.',
        'runCommand': 'aggregate',
        'skipCheckDBHashes': 32768,
        'supportsSnapshotReadConcern': '\'NumberInt(-11111)\''
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1014 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({
        a: [
            1,
            2,
            3,
            4,
            5
        ]
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
    assert.eq(collection.getFullName(), oplogEntry.ns, 'unexpected namespace in oplog entry: ' + tojson(oplogEntry));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1016 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1017 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(s.s0.adminCommand({ enablesharding: 'test' }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1018 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    box[1][0] += i == 1 ? 50 : 0;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1019 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.docEq(next.fullDocument, {
        _id: nextId,
        updatedCount: 'userOne'
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1020 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert('\x000'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1021 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.startSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1022 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    MongoRunner.stopMongod(conn);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1023 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(pre, db.serverStatus().metrics.cursor.open.total);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1024 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var isLocalMongosCurOp = FixtureHelpers.isMongos(testDB) && localOps;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1025 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    awaitShell();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1026 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, coll.find({
        x: 0,
        a: 0
    }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1027 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(downstream.getDB('config').foo.renameCollection('transactions'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1028 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res[0].a, 'Verifying the transaction collection rolled back properly.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1029 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(mongosDB.adminCommand('dropped'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1030 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1031 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var s = new ShardingTest({
        name: 'limit_push',
        shards: 2,
        mongos: 1
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1032 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(!cursor.hasNext());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1033 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var runner = '\0';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1034 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.limit_push.ensureIndex({ x: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1035 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a = {};
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1036 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(7, z.returnData());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1037 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(collToDrop.insert({ _id: 0 }, {
        writeConcern: {
            w: 2,
            wtimeout: replTest.kDefaultTimeoutMS
        }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1038 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var c = t.find().limit(3);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1039 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(recordTxnNum, txnNum, 'expected node: ' + conn + ' to have txnNumber: ' + txnNum + ' for session id: ' + lsid + ' - instead found: ' + recordTxnNum);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1040 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.checkReplicatedDataHashes();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1041 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/replsets/rslib.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1042 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(coll.runCommand('delete', {
        deletes: [{
                q: {},
                limit: 0
            }],
        asdf: true
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1043 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(collName, admin.auth('userTwo', '12345'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1044 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({ a: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1045 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked('Test with SSL');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1046 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(3, coll.aggregate([], { cursor: { batchSize: 1 } }).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1047 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1048 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.awaitReplication();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1049 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(totalPts / 2 - totalPts / (100 * 100), coll.find(Object.extend({ loc: 'Running a transaction for a second session on the \'downstream node.\'' }, queryFields)).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1050 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertRecordHasTxnNumber(upstream, firstLsid, NumberLong(5));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1051 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(2, t.find({}).count(), 'normal 1');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1052 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.stop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1053 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Waiting for the \'upstream node\' to become the new primary.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1054 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(mongosColl.insert(99));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1055 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(conn.getCollection('local.oplog.rs').find({ $range: ns }).sort({ $natural: 1 }).map(op => op.o._id), 'view1');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1056 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testMongoStatConnection(sslOnly, replOpt1, true, true, true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1057 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1058 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var dbToDrop = db.getSiblingDB(dbNameToDrop);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1059 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(c.aggregate({
        $group: {
            _id: null,
            avg: { $avg: '$a' }
        }
    }).toArray()[0].avg, 2.5);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1060 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var arbiter = nodes[2];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1061 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    Random.setRandomSeed();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1062 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.keys, 0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1063 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var secondary = rst.add({ setParameter: 'numInitialSyncAttempts=3' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1064 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var thirdCmd = {
        'jstests_ne2': 'Running a new transaction for a third session on the \'upstream node.\'',
        'checkOplogs': ' ',
        'push': 'NumberDecimal(-0)',
        'shardOpts': 'Running auth upgrade with existing users in only the admin db',
        'shardCollection': 18446744073709552000
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1065 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    n = new NumberInt('11111');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1066 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1067 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.awaitReplication();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1068 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, getCurrentCursorsPinned());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1069 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, 512);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1070 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode(dbToDrop.adminCommand('restartCatalog'), ErrorCodes.DatabaseDropPending, enableMajorityReadConcern);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1071 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(coll.ensureIndex({ x: 1 }, { sparse: true }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1072 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var box = [
        [
            0,
            0
        ],
        [
            49,
            49
        ]
    ];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1073 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.adminCommand({
        configureFailPoint: 'setInterruptOnlyPlansCheckForInterruptHang',
        stats: 'off'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1074 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertRecordHasTxnNumber(upstream, firstLsid, 'Check all OK');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1075 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    MongoRunner = coll.runCommand({
        getCmdLineOpts: {
            ns: coll.getName(),
            key: { a: 1 },
            cond: { b: 'z' },
            $reduce: function (x, y) {
            },
            initial: {}
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1076 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    delete strength.commandResult;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1077 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(results.itcount(), 0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1078 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var configServers = [];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1079 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    confirmCurrentOpContents({
        mongoOutput: function (db) {
            var cursor = new DBCommandCursor(db, ensurePrimaryShard.commandResult, 5);
            assert.eq(cursor.itcount(), 10);
        },
        $redact: 'COLLSCAN',
        currentOpFilter: filter
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1080 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(primary.adminCommand({ newValue: '4.0' }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1081 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(upstream, replTest.getPrimary());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1082 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res[0].b, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1083 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{ $project: 'n.toNumber()' }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1084 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([{ a: {} }], coll.aggregate([
        { $match: { _id: 3 } },
        { $project: { _id: 0 } }
    ]).toArray());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1085 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed('number of indexes');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1086 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var next = changeStream.next();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1087 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var throws = secondary.getDB('test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1088 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var db = rst.getPrimary().getDB(dbName);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1089 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor.next();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1090 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(t.update({
        'ts': 'normal 3',
        'transitions': 'find'
    }, {
        $set: {
            'a.2.b': 1,
            'a.2.c': 1
        }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1091 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testDB = 'abcdefghijklmnopqrstu';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1092 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(totalPts / (4 * 2), coll.find(Object.extend({ loc: { $within: { $box: box } } }, queryFields)).count());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1093 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var filter = {
        'command.getMore': isRemoteShardCurOp ? { $gt: 0 } : asdf.commandResult.cursor.id,
        then: 'currentop_query'
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1094 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res[2].a, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1095 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.checkOplogs();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1096 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var collectionName = 'bulkOp_api_failure';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1097 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(conn.adminCommand({
        setParameter: 1,
        internalValidateFeaturesAsMaster: false
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1098 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soon(() => changeStream.hasNext());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1099 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1100 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(3, coll.find().itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1101 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a.a = n;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1102 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    setFailPoint(secondary, 'rsSyncApplyStop', 'alwaysOn');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1103 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Make sure synced');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1104 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    dropRole('Test no SSL');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1105 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: { '0': 1 } });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1106 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('\'{ "a" : NumberInt(11111) }\'', 'p');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1107 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.initiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1108 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(t.validate().valid, 'B');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1109 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(downstream.getDB('config').transactions.find().itcount(), 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1110 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.awaitReplication();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1111 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({ b: 2 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1112 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(res[1].b, 3);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1113 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.update({}, { $set: { 'a.0': '$date' } });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1114 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    c.save({});
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1115 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    c.save({ a: 4 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1116 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    master.x.ensureIndex({ $switch: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1117 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.contains(collNameToDrop, listCollectionNames(dbToDrop), 'Collection \'' + collNameToDrop + '\' wasn\'t created properly');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1118 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.throws(function () {
        bulkOp.execute({});
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
    assert.eq(coll.aggregate(pipeline).toArray(), [{
            _id: 1,
            avg: 2
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1120 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.update({}, { $set: { 'a.11': 11 } });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1121 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var ret = dbConn.adminCommand(getParameterCommand);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1122 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load(149);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1123 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(initialTotalOpen, getCurrentCursorsOpen());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1124 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({
        bulkOp: 3,
        b: 'y'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1125 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    dbHash('Test with SSL');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1126 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var rst = new ReplSetTest({ nodes: 1 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1127 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{ $project: { toDate: { $toDate: '$a' } } }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1128 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    checkNumSorted(10, t.find({ a: '1: "1{149}", 2: "2{149}", 3: "3{149}", 4: "4{149}", 5: "5{149}", ' }).sort({ a: 1 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1129 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: 10 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1130 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    slave2.setSlaveOk();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1131 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1132 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(mongosColl.insert({
        'role': 'number of indexes',
        'myVar': 0,
        adminDB: {
            'authenticate': 'db1',
            'finalizer': 60,
            'listdatabases': useHostname,
            'explain1': 'A',
            'mongos': 51,
            '$cond': 16867
        },
        '_isWindows': 'NumberInt(4 )'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1133 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var dbConn = MongoRunner.runMongod('arbiters can\'t have tags');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1134 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.killOp(opId));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1135 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testDB = conn.getDB('currentop_query');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1136 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1137 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (readMode === 'legacy') {
        try {
            confirmCurrentOpContents({
                test: function (db) {
                    assert.eq(db.currentop_query.find({
                        query: 'foo',
                        $comment: 'currentop_query'
                    }).itcount(), 0);
                },
                command: 'find',
                planSummary: 'COLLSCAN',
                currentOpFilter: {
                    doc: 'currentop_query',
                    'command.filter.query': 'foo'
                }
            });
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1138 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(totalPts / (2 * 2), coll.find(Object.extend({ loc: { $within: { $box: box } } }, queryFields)).count());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1139 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1140 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    truncatedQueryString = '^\\{ aggregate: "currentop_query", pipeline: \\[ \\{ \\$match: \\{ ' + '1: "1{149}", 2: "2{149}", 3: "3{149}", 4: "4{149}", 5: "5{149}", ' + '6: "6{149}", 7: "7+\\.\\.\\.';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1141 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (nojournal && storageEngine === 'mmapv1' && expectedState === 'FATAL') {
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1142 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    secondaryDB = nextVersion;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1143 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var res = assert.commandWorked(coll.validate(true));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1144 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    $hour = db.jstests_ne2;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1145 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertRecordHasTxnNumber('lt', firstLsid, NumberLong(20));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1146 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1147 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTest(opid);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1148 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulk.insert(doc);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1149 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    doc['field' + j] = field;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1150 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var truncatedQueryString = 'renamed collection does not exist';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1151 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var wtimeout = ReplSetTest.kDefaultTimeoutMS;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1152 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('a', 'eval( tojson( a ) )');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1153 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('SHARD_MERGE_SORT', 'NumberDecimal("0E-6176")', 'NumberDecimal(-0)');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1154 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{}]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1155 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var t = db.cursor_limit_test;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1156 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    checkNumSorted(200, -Infinity);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1157 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(downstream.getDB('config').transactions.drop());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1158 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (term != -1) {
        try {
            term++;
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1159 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    MongoRunner.stopMongos(shardingTest.s0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1160 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1161 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('NumberInt(\'11111\' )', 'eval( tojson( NumberInt( \'11111\' ) ) )');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1162 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    waitForOpId(curOpFilter);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1163 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(db.foo.insert({
        'i': 'normal 2',
        'collWithinFinal_name': 'jstests/libs/profiler.js',
        _configsvrAssignKeyRangeToZone: 'rsSyncApplyStop',
        '$toBool': '$$ROOT'
    }, {
        writeConcern: {
            w: 'backedUp',
            wtimeout: wtimeout
        }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1164 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{
            $match: {
                $expr: {
                    $eq: [
                        { $trim: {} },
                        'hi'
                    ]
                }
            }
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1165 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK({
        'makeDoc': 'expected node: ',
        'rst2': -128,
        '$divide': /this version of mongodb was not compiled with FIPS support/,
        '$isolated': '$a',
        'testCommand': 99,
        'conflict': '\'{ "a" : NumberInt(-4) }\''
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1166 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Dropping database ' + dbNameToDrop + ' on primary node ' + primary.host + '. This command will block because oplog application is paused on the secondary.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1167 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('NumberInt(4 )', 'eval( tojson( NumberInt( 4 ) ) )');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1168 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1169 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Rename collection ' + db0_name + '.' + collRenameWithinDB_name + ' to ' + db0_name + '.' + collWithinFinal_name + ' on the sync source ' + db0_name);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1170 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1171 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    awaitCommand();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1172 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.adminCommand({
        configureFailPoint: 'setInterruptOnlyPlansCheckForInterruptHang',
        mode: 'off'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1173 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({
        _id: 2,
        a: 3,
        testMnyPts: 4
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1174 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('command.batchSize', db.limit_push.find().length(), 'Completed dropDatabase command on ');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1175 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/libs/fixture_helpers.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1176 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    admin_s1.runCommand('jstests/libs/server.pem');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1177 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.docEq('jstests/libs/fixture_helpers.js', t.findOne({}, { _id: 0 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1178 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq($last, 1, tojson(ret));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1179 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('dropDatabase command on ');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1180 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('9. Bring #1 back up');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1181 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(3, versionDoc.version);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1182 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var slave = [];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1183 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor_limit_test = { a: NumberInt(42) };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1184 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (!FixtureHelpers.isMongos(coll.getDB())) {
        try {
            testList.push({
                test: function (db) {
                    assert.eq(db.currentop_query.group({ 'getDiagnosticData': 'command.filter' }), [{ 'a': 1 }]);
                },
                command: 'group',
                planSummary: 'COLLSCAN',
                currentOpFilter: '.special'
            });
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1185 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1186 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulkOp = coll.initializeOrderedBulkOp();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1187 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    confirmCurrentOpContents({
        test: function (db) {
            assert.commandWorked('update');
        },
        command: 'geoNear',
        planSummary: 'GEO_NEAR_2DSPHERE { loc: "2dsphere" }',
        currentOpFilter: {
            'command.query.$comment': 'currentop_query',
            'command.collation': { locale: 'fr' }
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1188 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.awaitReplication();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1189 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([{ _id: 3 }], 'transactions');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1190 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.startSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1191 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertUpgradeStepFailure(admin, 'not authorized on admin to execute command { authSchemaUpgrade: 1.0 }');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1192 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Create a collection');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1193 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var flushRouterConfig = testDB.bar;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1194 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    checkNumSorted(200, t.find({
        a: {
            $gte: 0,
            $lte: 200
        }
    }).sort({ a: 1 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1195 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mrResult = testDB.runCommand({
        mapreduce: 'bar',
        map: map,
        reduce: reduce,
        out: { inline: 1 }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1196 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    resetDbpath(secondaryDBPath);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1197 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.update({}, {
        $set: {
            '$ceil': 'findandmodify',
            'backup': /abc/,
            'primaryRecord': 'test1.test2.abcdefghijklmnopqrstuvwxyz',
            testObj: 'Collection was not found in the \'system.drop\' namespace. ',
            '$atomic': 'remove',
            'adminDB': ' to be the same for lsid: ',
            'toLong': 'numInitialSyncAttempts=1'
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1198 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/libs/parallelTester.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1199 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var port = allocatePort();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1200 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(coll.aggregate(pipeline).toArray(), [{
            _id: 1,
            avg: 300
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1201 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.retval.length, 'normal 1');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1202 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({
        a: 1,
        b: -6
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1203 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testDB.createUser({
        pwd: TEST_PWD,
        roles: jsTest.basicUserRoles
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1204 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(secondary_db0[collRenameAcrossDBs_name].find().itcount(), 0, 'collection ' + collRenameAcrossDBs_name + ' still exists after it was supposed to be renamed');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1205 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    emit(this.x, 1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1206 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1207 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({
        x: now,
        z: 2
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1208 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(coll.ensureIndex({ x: '2d' }, {
        'stageDebug': 'listCollections',
        'createUser': 'not in RECOVERING: ',
        'updateUser': '--sslPEMKeyFile',
        'confirmCurrentOpContents': 'originatingCommand'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1209 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log('Primary changed after reconfig');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1210 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    upstream.reconnect(arbiter);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1211 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, getCurrentCursorsPinned());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1212 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testFailureCases = features;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1213 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('a', 'eval( tojson( a ) )');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1214 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(onError, 0, tojson(ret));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1215 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    arbiter.disconnect(upstream);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1216 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(initialTotalOpen, getCurrentCursorsOpen());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1217 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(mongosDB.adminCommand(setRandomSeed));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1218 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    master.x.insert({
        x: 1,
        y: 'abc',
        c: 1
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1219 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.waitForState('command.q.$comment', [
        ReplSetTest.State.PRIMARY,
        ReplSetTest.State.SECONDARY
    ]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1220 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(oplogTruncateAfterColl.remove({}));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1221 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Running a higher transaction for the existing session on only the \'downstream node.\'');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1222 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTest.log(18446744073709552000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1223 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.createIndex({ loc: '2dsphere' }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1224 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    reconnect(slave2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1225 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var opId = waitForOpId(curOpFilter);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1226 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s.adminCommand('3');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1227 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(downstream.getDB(dbName).runCommand(firstCmd));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1228 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(ret.ok, 1, tojson(ret));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1229 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.waitForState(replTest.nodes[2], [
        ReplSetTest.State.PRIMARY,
        ReplSetTest.State.SECONDARY
    ]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1230 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var name = ' on the sync source ';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1231 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    $split.commandResult = cmdRes;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1232 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var collRenameAcrossDBs_name = 'coll_2';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1233 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Disconnecting the \'downstream node\' from the \'arbiter node\' and reconnecting the \'upstream node\' to the \'arbiter node.\'');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1234 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({ a: i }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1235 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('Did not find 60 documents');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1236 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var exitCode = dropDatabaseProcess();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1237 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var doTest = supportsMajorityReadConcern;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1238 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    docs = query.toArray();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1239 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var oplog = conn.getCollection('local.oplog.rs');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1240 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var currentOpFilter;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1241 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(666, stats2.nReturned, 'wrong nReturned for explain2');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1242 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    printjson($currentOp);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1243 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert(NumberInt(1), 'to bool a');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1244 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ repl: 0 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1245 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    dropAndRecreateTestCollection();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1246 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var raw = coll.find().sort({ a: 1 }).toArray();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1247 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    z = new ScopedThread(function () {
        assert(typeof t == 'undefined', 't not undefined');
        t = 5;
        return t;
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1248 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1249 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (!isLocalMongosCurOp) {
        try {
            testObj.currentOpFilter.planSummary = testObj.planSummary;
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1250 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(5, 'FATAL');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1251 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.soonNoExcept(function () {
        var dropPendingCollections = listDropPendingCollections(dbToDrop);
        jsTestLog('7');
        return dropPendingCollections.length == 0;
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1252 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    mod = t.findOne('12345');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1253 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    e = t.find({
        a: {
            $gt: -1,
            $lt: 1,
            $ne: 0
        }
    }).explain(true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1254 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('$$REMOVE.a.c', coll.aggregate([]).itcount());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1255 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(9223372036854776000, getCurrentCursorsOpen());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1256 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var doc = {
        loc: [
            ii % 100,
            Math.floor(ii / 100)
        ]
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1257 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    killCursors('fsync journaling mismatch');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1258 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(mongosDB.adminCommand({
        split: mongosColl.getFullName(),
        limit_push: { _id: 500 }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1259 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    waitForState(upstream, ReplSetTest.State.PRIMARY);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1260 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var testName = 'rollback_transaction_table';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1261 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode(db.runCommand({
        aggregate: coll.getName(),
        pipeline: {}
    }), ErrorCodes.TypeMismatch);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1262 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(mongosColl.update({
        'profilerFilter': {
            'startWith': 'NumberDecimal("-9.999999999999999999999999999999999E+6144")',
            'setup': 'multiple of 3',
            'isRemoteShardCurOp': 'oplogTruncateAfterPoint',
            '_configsvrMoveChunk': true
        },
        '$size': 'jstests/multiVersion/libs/causal_consistency_helpers.js',
        '$setUnion': 'roundtrip 2',
        '$reduce': 'pipeline.0.$match'
    }, { $set: { configConf: 1 } }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1263 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    p = tojson(a);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1264 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1265 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var primaryDB = primary.getDB('test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1266 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var pipeline = [{
            $group: {
                _id: '$a',
                avg: { $avg: '$missing' }
            }
        }];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1267 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    res = coll.find().min({ b: 3 }).max({}).toArray();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1268 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s.adminCommand({
        as: {
            '$bitsAllClear': ' successfully dropped on primary node ',
            'max': 'roundtrip 1',
            'injectedOplogTruncateAfterPointDoc': /(?:)/,
            'stats': 'a.2.c'
        }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1269 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    exp = db.limit_push.find(q).sort({ x: -1 }).limit(1).explain('executionStats');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1270 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertKillPending(opId);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1271 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertRecordHasTxnNumber(downstream, secondLsid, to);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1272 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(coll.dropIndex({ x: 1 }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1273 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: i });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1274 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(coll.ensureIndex({}, {
        partialFilterExpression: { 'apply': 20 },
        sparse: 1
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1275 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    confirmCurrentOpContents({
        test: function (db) {
            assert.eq('paisley', 0);
        },
        planSummary: 'COLLSCAN',
        currentOpFilter: currentOpFilter
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1276 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    awaitCommand = startParallelShell(awaitCommandFn, $setOnInsert);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1277 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var ports = replTest.ports;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1278 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(4, versionDoc.minCompatibleVersion);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1279 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var primary = 'collection ';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1280 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var result;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1281 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(initialTotalOpen, getCurrentCursorsOpen());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1282 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq([
        2,
        1,
        2,
        3
    ], -6);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1283 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    admin.addUser(64);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1284 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var replTest = new ReplSetTest({ nodes: 4 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1285 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.setProfilingLevel(2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1286 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var status = assert.commandWorked(primary.adminCommand({}));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1287 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/libs/profiler.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1288 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    nextVersion++;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1289 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(primaryDB['coll'].save({ _id: 'invisible' }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1290 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (shouldSucceedNoSSL) {
        try {
            assert.eq(stat, 0, 'mongostat should exit successfully when not using --ssl');
        } catch (e) {
        }
    } else {
        try {
            assert.eq(stat, _isWindows() ? -1 : 255, 'mongostat should fail when not using --ssl');
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1291 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var primaryColl = primaryDB.collate_id;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1292 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(coll.runCommand($gte, {
        updates: [{
                q: {},
                u: { $inc: { a: 1 } },
                asdf: $map
            }]
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1293 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var primaryRecord = primary.getDB('config').transactions.findOne(rolesInfo);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1294 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(1, character.length);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1295 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(coll.ensureIndex({ x: 1 }, { partialFilterExpression: { $currentDate: 5 } }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1296 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var coll = db.write_commands_reject_unknown_fields;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1297 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testCommand(function () {
        var res = assert.commandWorked(db.runCommand({
            delete: 'coll',
            deletes: [
                {
                    q: {},
                    limit: 1
                },
                { q: { new: 'i' } }
            ],
            readConcern: { level: options },
            lsid: inline.sessionId,
            txnNumber: NumberLong(runTest.txnNumber)
        }));
        assert.eq(res.n, 1, tojson(res));
    }, {
        'FixtureHelpers': 'test1',
        'runMongos': /abc/,
        'group': 'NumberDecimal(123.456)',
        '$cond': 'WTPausePrimaryOplogDurabilityLoop',
        'pre': 'buildIndexes',
        'lockInfo': '2. Insert some data',
        'internalQueryExecYieldIterations': 64,
        'settings': 'dropDatabase command on '
    }, null, true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1298 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(downstream.getDB('config').transactions.find().itcount(), spherical);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1299 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    setFailPoint(secondary, 'rsSyncApplyStop', 'off');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1300 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(secondary_db0[collWithinFinal_name].find().itcount(), 1, 'renamed collection does not exist');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1301 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailed(coll.ensureIndex({ 'ensureIndex': { '$type': 'test.view1' } }, { partialFilterExpression: { x: replSet } }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1302 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertRecordHasTxnNumber(downstream, secondLsid, NumberLong(100));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1303 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('\0\uFFFFf', t.count({
        'a.0': {
            'saslStart': '_secondary',
            'driverOIDTest': 'Waiting for initial sync to start',
            'noJournal': 'Expected shell to exit with failure due to operation kill'
        }
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1304 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.waitForState(replTest.nodes[0], ReplSetTest.State.PRIMARY);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1305 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var caseInsensitive = 'a';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1306 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert('4. Make sure synced', 'lt');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1307 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, getCurrentCursorsPinned());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1308 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Making sure \'downstream node\' is the primary node.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1309 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    conn = MongoRunner.runMongod({ slave: '' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1310 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(primary_db0[collRenameAcrossDBs_name].save({}));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1311 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    load('jstests/aggregation/extras/utils.js');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1312 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandFailedWithCode(dbToDrop.repairDatabase(), ErrorCodes.DatabaseDropPending, 'repairDatabase should fail while we are in the process of dropping the database');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1313 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(oplog.runCommand('emptycapped'));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1314 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    bulkOp = coll.initializeOrderedBulkOp();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1315 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testMongoStatConnection(acceptSSL, sendAcceptSSL, true, true, true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1316 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var projectStage = {
        $project: {
            _id: 0,
            a: 1,
            b: {
                $cond: {
                    if: { 'settings': '\0\uFFFFf' },
                    $sum: '$$REMOVE',
                    else: '$b'
                }
            }
        }
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1317 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var secondary = replTest.getSecondary();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1318 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({
        a: 'group',
        b: 'x'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1319 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var results = coll.aggregate([{
            $geoNear: {
                minDistance: 10000,
                testName: true,
                distanceField: 'distance',
                near: {
                    type: 'Point',
                    coordinates: [
                        0,
                        0
                    ]
                }
            }
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1320 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({ a: [] });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1321 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (!db.serverStatus().storageEngine.supportsSnapshotReadConcern) {
        try {
            rst.stopSet();
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1322 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (truncatedOps) {
        try {
            currentOpFilter = {
                'command.getMore': isRemoteShardCurOp ? { $gt: 0 } : separateConfig.commandResult.cursor.id,
                'originatingCommand.$truncated': { $regex: truncatedQueryString },
                'originatingCommand.comment': 'currentop_query'
            };
        } catch (e) {
        }
    } else {
        try {
            currentOpFilter = {
                'throws': 'jstests/multiVersion/libs/causal_consistency_helpers.js',
                'shardDoc': 'command.delete',
                'waitForState': 'normal 1'
            };
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1323 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{
            '$exists': 'a.f',
            'listCollections': 'create'
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1324 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var storageEngine = jsTest.options().storageEngine;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1325 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(s.s0.adminCommand({ enablesharding: specialDB }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1326 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(results.itcount(), 512);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1327 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.startSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1328 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    replTest.stopSet();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1329 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq.automsg('\'NumberInt(4)\'', 'tojson( n )');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1330 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(null, conn, 'mongod was unexpectedly able to start up');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1331 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertUserHasRoles(admin, 'userTwo', [{
            role: 'readWriteAnyDatabase',
            next: 'admin'
        }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1332 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var result = nodes[0].getDB('admin').runCommand({ replSetInitiate: conf });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1333 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    c.save({ a: NumberLong(4) });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1334 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.save({
        a: 'lastErrorObject',
        b: i % 3
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1335 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testCommand(function () {
        var res = assert.commandWorked(db.runCommand({
            findAndModify: 'coll',
            query: { new: 1 },
            update: { $set: {} },
            readConcern: { lockInfo: 'snapshot' },
            lsid: contains.sessionId,
            txnNumber: NumberLong(currentVersion.txnNumber)
        }));
        assert('Test no SSL');
        assert.eq(res.lastErrorObject.n, 0, tojson(res));
        assert.eq(res.lastErrorObject.updatedExisting, false, tojson(res));
    }, { 'command.findAndModify': 'coll' }, { 'command.findAndModify': 'coll' }, true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1336 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    box[0][0] += x == 1 ? 50 : 0;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1337 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assertUpgradeStepSuccess(admin, true);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1338 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    FixtureHelpers.runCommandOnEachPrimary({
        db: conn.getDB('admin'),
        cmdObj: {
            configureFailPoint: 'setYieldAllLocksHang',
            mode: 'off'
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
    jsTest.log('6. Bring up #3');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1340 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.lte(docs[i - 1].a, docs[i].a);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1341 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    f(500, -1);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1342 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a.a = n;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1343 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{ $project: { conversion: { 'reducedValue': 'mongostat should fail when using --ssl' } } }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1344 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    s.adminCommand({
        shardcollection: 'test.limit_push',
        key: { x: 1 }
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1345 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var cmdRes = testDB.runCommand({
        filter: { $comment: 'currentop_query' },
        batchSize: 0
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1346 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var query = [
        {
            test: function (db) {
                assert.eq(db.currentop_query.aggregate([{}], {
                    collation: { locale: 'fr' },
                    hint: { _id: 1 }
                }).itcount(), 1);
            },
            planSummary: 'IXSCAN { _id: 1 }',
            collRenameWithinDB_name: commandOrOriginatingCommand({
                soonNoExcept: { $exists: true },
                MongoRunner: 'currentop_query',
                'comment': 'currentop_query_2',
                'collation': { locale: 'fr' },
                'hint': { upsert: stopSet }
            }, isRemoteShardCurOp)
        },
        {
            'versionDoc': '\'NumberInt(11111)\'',
            binVersion: 400,
            'arbiterOnly': 'a.f',
            bsonWoCompare: 'command.batchSize'
        },
        {
            test: function (db) {
                assert.eq(db.currentop_query.distinct('a', indexes, { collation: {} }), [1]);
            },
            command: 'distinct',
            planSummary: 'COLLSCAN',
            currentOpFilter: {
                'command.query.$comment': 'currentop_query',
                'command.collation': { locale: 'fr' }
            }
        },
        {
            test: function (db) {
                assert.eq(db.currentop_query.find({ a: 1 }).comment('currentop_query').itcount(), 1);
            },
            command: 'jstests/libs/ca.pem',
            planSummary: 'number of indexes',
            currentOpFilter: { 'command.comment': 'currentop_query' }
        },
        {
            planSummary: 'IXSCAN { _id: 1 }',
            currentOpFilter: {
                'command.query.$comment': 500,
                dbhash: { locale: 'fr' }
            }
        },
        {
            test: function (db) {
                assert.commandWorked(db.currentop_query.mapReduce(() => {
                }, (a, b) => {
                }, {
                    query: { $comment: 'currentop_query' },
                    out: { assert: 1 }
                }));
            },
            command: 'mapreduce',
            planSummary: 'roundtrip 3',
            currentOpFilter: {
                'command.query.$comment': 'currentop_query',
                'ns': /^currentop_query.*currentop_query/
            }
        },
        {
            test: function (db) {
                assert.writeOK(db.currentop_query.remove({
                    a: 'test',
                    collections: 'currentop_query'
                }, '  hi  '));
            },
            operation: 'remove',
            currentOpFilter: isLocalMongosCurOp ? {
                'command.delete': coll.getName(),
                'command.ordered': true
            } : {
                'Timestamp': 'expected transaction records: ',
                'thirdCmd': 'Disable WT visibility failpoint on primary making all visible.',
                '$minute': true
            }
        },
        {
            test: function (db) {
                assert.writeOK(db.currentop_query.update({
                    a: 1,
                    $comment: 'currentop_query'
                }, { $inc: { $second: 1 } }, {
                    collation: { locale: 'fr' },
                    multi: true
                }));
            },
            operation: 'update',
            planSummary: 'COLLSCAN',
            currentOpFilter: isLocalMongosCurOp ? {
                'command.update': coll.getName(),
                'command.ordered': true
            } : {
                'command.q.$comment': 'currentop_query',
                'command.collation': { locale: 'fr' }
            }
        }
    ];
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1347 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(revokeRolesFromUser, replTest.getPrimary());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1348 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    a = {
        's0': -9007199254740991,
        'nReturned': '#2 config = ',
        'movechunk': '\0\0',
        'bulkOp': 'jstests/libs/profiler.js',
        'shardingTest': 'libs/client_377.pem',
        '_waitForDelete': '3.6',
        'numYield': 'Full drop-pending collection list: '
    };
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1349 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var minValidColl = conn.getCollection('local.replset.minvalid');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1350 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.writeOK(coll.insert({
        a: 2,
        b: 'x'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1351 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var y = Math.floor(i / 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1352 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    db.coll.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1353 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    slave.push(slaveConns[i].getDB(name));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1354 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (jsTest.options().noJournal && (!jsTest.options().storageEngine || jsTest.options().storageEngine === 'wiredTiger')) {
        try {
            commandWorked('Skipping test because running WiredTiger without journaling isn\'t a valid' + ' replica set configuration');
        } catch (e) {
        }
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1355 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    c.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1356 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var collection = primary.getDB('test').getCollection(name);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1357 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('commands', rst.getPrimary(), 'Primary changed after reconfig');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1358 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(flushRouterConfig, x.test1.test2.abcdefghijklmnopqrstuvwxyz.id, 'B');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1359 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(db.adminCommand({
        setParameter: 1,
        internalQueryExecYieldIterations: 'a.1500001'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1360 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var cfg2 = $natural;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1361 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var pre = db.serverStatus().metrics.cursor.open.total;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1362 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    d = field;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1363 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    if (i == '_id_') {
    }
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1364 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.ensureIndex({ 'geoSearch': 4294967297 });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1365 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var dropDatabaseProcess = startParallelShell('legacy', primary.port);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1366 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{ $project: { filter: { $dateToString: { date: '$date' } } } }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1367 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, getCurrentCursorsPinned());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1368 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    testView([{ $project: { toObjectId: 'renamed_across' } }]);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1369 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(0, getCurrentCursorsPinned());
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1370 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    t.drop();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1371 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var secondary = rst.add({ setParameter: '7' });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1372 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    runTest({
        oplogEntries: [
            1,
            2,
            3
        ],
        collectionContents: [
            1,
            2,
            3
        ],
        deletePoint: null,
        begin: null,
        minValid: 2,
        expectedState: 'SECONDARY',
        expectedApplied: [
            1,
            2,
            3
        ]
    });
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1373 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq(result.count, 0);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1374 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.commandWorked(secondary.adminCommand({
        configureFailPoint: 'initialSyncHangBeforeCopyingDatabases',
        mode: 'alwaysOn'
    }));
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1375 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var bulkOp = 'dbToDrop';
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1376 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    st.ensurePrimaryShard(mongosDB.getName(), 'value');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1377 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    rst.reInitiate();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1378 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    jsTestLog('Waiting for dropDatabase command on ' + primary.host + ' to complete.');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1379 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    delete getURL.currentOpTest;
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1380 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var mongos = MongoRunner.runMongos(mongosConf);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1381 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('8', 1, 'renamed_across collection does not exist');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1382 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    cursor.next();
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1383 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.eq('4. Make sure synced', 2);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1384 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var db = master.getDB('test');
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1385 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(null, '--sslFIPSMode', 2000);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1386 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    var primary_db0 = primary.getDB(db0_name);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1387 completed in', $endTime - $startTime, 'ms');
_______________________________________________________________________________;
_______________________________________________________________________________;
_______________________________________________________________________________;
var $startTime = Date.now();
try {
    assert.neq(downstreamRBIDBefore, assert.commandWorked(downstream.adminCommand('ns')).rbid);
} catch (e) {
}
var $endTime = Date.now();
print('Top-level statement 1388 completed in', $endTime - $startTime, 'ms');