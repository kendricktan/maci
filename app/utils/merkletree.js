// @flow
const { mimc7 } = require('circomlib')

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
    this.leafs = []

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

  /*  Helper function to hash the left and right values
   *  of the leafs
   */
  hashLeftRight (left: BigInt, right: BigInt): BigInt {
    const k = BigInt(21888242871839275222246405745257275088548364400416034343698204186575808495617)
    let R = BigInt(0)

    R = R + left % k
    R = mimc7.hash(R, BigInt(0))

    R = R + right % k
    R = mimc7.hash(R, BigInt(0))

    return R
  }

  /* Inserts a new value into the merkle tree */
  insert (leaf: BigInt) {
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
    this.leafs.push(leaf)
  }

  /* Updates merkletree leaf at `leafIndex` with `newLeafValue` */
  update (leafIndex: Number, newLeafValue: BigInt) {
    this._update(
      leafIndex,
      newLeafValue,
      this.getPath(leafIndex)
    )
  }

  /*  _Verbose_ API to update the value of the leaf in the current tree.
   *  The reason why its so verbose is because I wanted to maintain compatibility
   *  with the smart contract.
   *  (which is very expensive to update if we do it naively)
   */
  _update (
    leafIndex: Number,
    leaf: BigInt,
    path: Array<BigInt>
  ) {
    let curIdx = leafIndex
    let currentLevelHash = this.leafs[leafIndex]
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
    this.leafs[leafIndex] = leaf
  }

  /*  Gets the path needed to construct a the tree root
   *  Used for quick verification.
   *  Runs in O(log(N)), where N is the number of leafs
   */
  getPath (leafIndex: Number): Array<BigInt> {
    let curIdx = leafIndex
    const path = []

    for (let i = 0; i < this.depth; i++) {
      if (curIdx % 2 === 0) {
        path.push(this.filledPaths[i][curIdx + 1])
      } else {
        path.push(this.filledPaths[i][curIdx - 1])
      }
      curIdx = parseInt(curIdx / 2)
    }

    return path
  }
}

const m = new MerkleTree(4, BigInt(0))

m.insert(BigInt(100))
m.insert(BigInt(2000))
m.update(0, BigInt(500))
m.update(1, BigInt(42))

console.log(m.leafs)

// Abstract away `new` keyword for API
const createMerkleTree = (
  treeDepth: Number,
  zeroValue: BigInt
): MerkleTree => new MerkleTree(treeDepth, zeroValue)

module.exports = {
  createMerkleTree
}