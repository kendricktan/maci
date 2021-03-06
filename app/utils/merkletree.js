// @flow
import type { Pool } from 'pg'

const { bigInt } = require('snarkjs')
const { hashLeftRight, multiHash } = require('./crypto')
const { stringifyBigInts, unstringifyBigInts } = require('./helpers')

class MerkleTree {
  /*  Creates an optimized MerkleTree with `treeDepth` depth,
   *  of which are initialized with the initial value `zeroValue`.
   *
   *  i.e. the 0th level is initialized with `zeroValue`,
   *       and the 1st level is initialized with
   *       hashLeftRight(`zeroValue`, `zeroValue`)
   */
  constructor (depth: Number, zeroValue: BigInt) {
    this.depth = depth
    this.zeroValue = zeroValue
    this.leaves = [] // Hash value of the leaves
    this.leavesRaw = [] // Raw hash value of the leaves
    this.leafNumber = Math.pow(2, depth)

    // Values to create the hash values of the leaves
    // NOTE: encryptedValues contains values of the encrypted values
    this.encryptedValues = []

    // TODO: WJ suggests that we separate encryption code from Merkle Tree code
 
    // Public keys used to decrypt the encrypted values
    // (decryption key is generated via ecdh)
    this.ecdhPublicKeys = []

    this.zeros = {
      0: zeroValue
    }
    this.filledSubtrees = {
      0: zeroValue
    }
    this.filledPaths = {
      0: {}
    }

    for (let i = 1; i < depth; i++) {
      this.zeros[i] = this.hashLeftRight(this.zeros[i - 1], this.zeros[i - 1])
      this.filledSubtrees[i] = this.zeros[i]
      this.filledPaths[i] = {}
    }

    this.root = this.hashLeftRight(
      this.zeros[this.depth - 1],
      this.zeros[this.depth - 1]
    )

    this.nextIndex = 0
  }

  equals (mk2: MerkleTree): Boolean {
    // eslint-disable-next-line
    const stringify = (x) => JSON.stringify(stringifyBigInts(x))

    return (this.nextIndex.toString() === mk2.nextIndex.toString()) &&
      (this.depth.toString() === mk2.depth.toString()) &&
      (this.leafNumber.toString() === mk2.leafNumber.toString()) &&
      (this.root.toString() === mk2.root.toString()) &&
      (stringify(this.filledPaths) === stringify(mk2.filledPaths)) &&
      (stringify(this.filledSubtrees) === stringify(mk2.filledSubtrees)) &&
      (stringify(this.leaves) === stringify(mk2.leaves)) &&
      (stringify(this.ecdhPublicKeys) === stringify(mk2.ecdhPublicKeys)) &&
      (stringify(this.encryptedValues) === stringify(mk2.encryptedValues))
  }

  hash (values: Any | Array<Any>): BigInt {
    if (Array.isArray(values)) {
      return BigInt(multiHash(values.map((x: Any): BigInt => bigInt(x))))
    }

    return bigInt(multiHash([BigInt(values)]))
  }

  /*  Helper function to hash the left and right values
   *  of the leaves
   */
  hashLeftRight (left: BigInt, right: BigInt): BigInt {
    return hashLeftRight(left, right)
  }

  /* Inserts a new value into the merkle tree */
  insert (leaf: BigInt, rawValue: ?object) {
    let curIdx = this.nextIndex
    this.nextIndex += 1

    let currentLevelHash = leaf
    let left
    let right

    for (let i = 0; i < this.depth; i++) {
      if (curIdx % 2 === 0) {
        left = currentLevelHash
        right = this.zeros[i]

        this.filledSubtrees[i] = currentLevelHash

        this.filledPaths[i][curIdx] = left
        this.filledPaths[i][curIdx + 1] = right
      } else {
        left = this.filledSubtrees[i]
        right = currentLevelHash

        this.filledPaths[i][curIdx - 1] = left
        this.filledPaths[i][curIdx] = right
      }

      currentLevelHash = this.hashLeftRight(left, right)
      curIdx = parseInt(curIdx / 2)
    }

    this.root = currentLevelHash
    this.leaves.push(leaf)

    if (rawValue === undefined) {
      this.leavesRaw.push(null)
    } else {
      this.leavesRaw.push(rawValue)
    }
  }

  /* Updates merkletree leaf at `leafIndex` with `newLeafValue` */
  update (
    leafIndex: Number,
    leaf: BigInt,
    rawValue: ?object
  ) {
    if (leafIndex >= this.nextIndex) {
      throw new Error("Can't update leafIndex which hasn't been inserted yet!")
    }

    // eslint-disable-next-line no-unused-vars
    const [path, _] = this.getPathUpdate(leafIndex)

    this._update(
      leafIndex,
      leaf,
      rawValue,
      path
    )
  }

  /*  _Verbose_ API to update the value of the leaf in the current tree.
   *  The reason why its so verbose is because I wanted to maintain compatibility
   *  with the merkletree smart contract obtained from semaphore.
   *  (https://github.com/kobigurk/semaphore/blob/2933bce0e41c6d4df82b444b66b4e84793c90893/semaphorejs/contracts/MerkleTreeLib.sol)
   *  It is also very expensive to update if we do it naively on the EVM
   */
  _update (
    leafIndex: Number,
    leaf: BigInt,
    rawValue: object,
    path: Array<BigInt>
  ) {
    if (leafIndex >= this.nextIndex) {
      throw new Error("Can't update leafIndex which hasn't been inserted yet!")
    }

    let curIdx = leafIndex
    let currentLevelHash = this.leaves[leafIndex]
    let left
    let right

    for (let i = 0; i < this.depth; i++) {
      if (curIdx % 2 === 0) {
        left = currentLevelHash
        right = path[i]
      } else {
        left = path[i]
        right = currentLevelHash
      }

      currentLevelHash = this.hashLeftRight(left, right)
      curIdx = parseInt(curIdx / 2)
    }

    if (this.root !== currentLevelHash) {
      throw new Error('MerkleTree: tree root / current level has mismatch')
    }

    curIdx = leafIndex
    currentLevelHash = leaf

    for (let i = 0; i < this.depth; i++) {
      if (curIdx % 2 === 0) {
        left = currentLevelHash
        right = path[i]

        this.filledPaths[i][curIdx] = left
        this.filledPaths[i][curIdx + 1] = right
      } else {
        left = path[i]
        right = currentLevelHash

        this.filledPaths[i][curIdx - 1] = left
        this.filledPaths[i][curIdx] = right
      }

      currentLevelHash = this.hashLeftRight(left, right)
      curIdx = parseInt(curIdx / 2)
    }

    this.root = currentLevelHash
    this.leaves[leafIndex] = leaf
    this.leavesRaw[leafIndex] = rawValue || {}
  }

  /*  Gets the path needed to construct a the tree root
   *  Used for quick verification on updates.
   *  Runs in O(log(N)), where N is the number of leaves
   */
  getPathUpdate (leafIndex: Number): [Array<BigInt>, Array<Number>] {
    if (leafIndex >= this.nextIndex) {
      throw new Error('Path not constructed yet, leafIndex >= nextIndex')
    }

    let curIdx = leafIndex
    const path = []
    const pathIndex = []

    for (let i = 0; i < this.depth; i++) {
      if (curIdx % 2 === 0) {
        path.push(this.filledPaths[i][curIdx + 1])
        pathIndex.push(0)
      } else {
        path.push(this.filledPaths[i][curIdx - 1])
        pathIndex.push(1)
      }
      curIdx = parseInt(curIdx / 2)
    }

    return [path, pathIndex]
  }

  /*  Gets the path needed to construct a the tree root
   *  Used for quick verification on inserts.
   *  Runs in O(log(N)), where N is the number of leaves
   */
  getPathInsert (): [Array<BigInt>, Array<Number>, Array<Number>] {
    let curIdx = this.nextIndex

    const pathIndex = []

    for (let i = 0; i < this.depth; i++) {
      if (curIdx % 2 === 0) {
        pathIndex.push(0)
      } else {
        pathIndex.push(1)
      }
      curIdx = parseInt(curIdx / 2)
    }

    return [
      this.zeros,
      this.filledSubtrees,
      pathIndex
    ]
  }
}

// Helper function to abstract away `new` keyword for API
const createMerkleTree = (
  treeDepth: Number,
  zeroValue: BigInt
): MerkleTree => new MerkleTree(treeDepth, zeroValue)

// Helper function to save merkletree into a database
// If leafIndex is not defined, it saves the latest leaf
const saveMerkleTreeToDb = async (
  pool: Pool,
  mkName: String,
  mk: MerkleTree,
  leafIndex: ?Number
) => {
  const mkQuery = {
    text: `INSERT INTO
      merkletrees(
        name,
        depth,
        next_index,
        root,
        zero_value,
        zeros,
        filled_sub_trees,
        filled_paths
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8
      ) ON CONFLICT (name) DO UPDATE SET
        name = excluded.name,
        depth = excluded.depth,
        next_index = excluded.next_index,
        root = excluded.root,
        zero_value = excluded.zero_value,
        zeros = excluded.zeros,
        filled_sub_trees = excluded.filled_sub_trees,
        filled_paths = excluded.filled_paths
      ;`,
    values: [
      mkName,
      mk.depth,
      mk.nextIndex,
      stringifyBigInts(mk.root),
      stringifyBigInts(mk.zeroValue),
      stringifyBigInts(mk.zeros),
      stringifyBigInts(mk.filledSubtrees),
      stringifyBigInts(mk.filledPaths)
    ]
  }

  // Saves merkle tree state
  await pool.query(mkQuery)

  // Get merkletree id from db
  const mkTreeRes = await pool.query({
    text: 'SELECT * FROM merkletrees WHERE name = $1 LIMIT 1;',
    values: [mkName]
  })
  const mkTreeId = mkTreeRes.rows[0].id

  // Current leaf index
  const selectedLeafIndex = leafIndex === undefined ? mk.nextIndex - 1 : leafIndex

  const leafQuery = {
    text: `INSERT INTO 
        leaves(merkletree_id, index, raw, hash)
        VALUES($1, $2, $3, $4)
        ON CONFLICT(merkletree_id, index) DO UPDATE SET
          merkletree_id = excluded.merkletree_id,
          index = excluded.index,
          raw = excluded.raw,
          hash = excluded.hash
        `,
    values: [
      mkTreeId,
      selectedLeafIndex,
      { data: stringifyBigInts(mk.leavesRaw[selectedLeafIndex]) },
      stringifyBigInts(mk.leaves[selectedLeafIndex])
    ]
  }

  // Saves latest leaf to merkletree id
  await pool.query(leafQuery)
}

// Help function to load merkletree from a database
const loadMerkleTreeFromDb = async (
  pool: Pool,
  mkName: String,
): MerkleTree => {
  const mkQuery = {
    text: 'SELECT * FROM merkletrees WHERE name = $1 LIMIT 1;',
    values: [mkName]
  }
  const mkResp = await pool.query(mkQuery)

  if (mkResp.rows.length === 0) {
    throw new Error(`MerkleTree named ${mkName} not found in database`)
  }

  // Get MerkleTree result
  const mkRes = mkResp.rows[0]
  const mkResBigInt = unstringifyBigInts(mkResp.rows[0])

  const mk = createMerkleTree(
    mkRes.depth,
    mkResBigInt.zero_value
  )

  mk.nextIndex = mkRes.next_index
  mk.root = mkResBigInt.root
  mk.zeros = mkResBigInt.zeros
  mk.filledSubtrees = mkResBigInt.filled_sub_trees
  mk.filledPaths = mkResBigInt.filled_paths

  // Get leaves
  const leavesQuery = {
    text: 'SELECT * FROM leaves WHERE merkletree_id = $1 ORDER BY index ASC;',
    values: [mkRes.id]
  }
  const leavesResp = await pool.query(leavesQuery)

  // Get leaves values
  const leaves = leavesResp.rows.map((x: Any): BigInt => unstringifyBigInts(x.hash))
  const leavesRaw = leavesResp.rows.map((x: Any): Array<BigInt> => unstringifyBigInts(x.raw).data)

  mk.leaves = leaves
  mk.leavesRaw = leavesRaw

  return mk
}

module.exports = {
  createMerkleTree,
  saveMerkleTreeToDb,
  loadMerkleTreeFromDb,
  MerkleTree
}
