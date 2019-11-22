const assert = require('chai').assert
const ethers = require('ethers')
const { mimc7 } = require('circomlib')

const deployedAddresses = require('../app/contracts/DeployedAddresses.json')
const { stringifyBigInts, linkLibraries } = require('../_build/utils/helpers')
const { createMerkleTree } = require('../_build/utils/merkletree')
const { ganacheConfig, merkleTreeConfig } = require('../maci-config')

const provider = new ethers.providers.JsonRpcProvider(ganacheConfig.host)
const privateKey = ganacheConfig.privateKey
const wallet = new ethers.Wallet(privateKey, provider)

const hasherDef = require('../app/contracts/Hasher.json')
const hasherFactory = new ethers.ContractFactory(
  hasherDef.abi,
  linkLibraries(hasherDef.bytecode, 'MiMC', deployedAddresses.mimcAddress),
  wallet
)

const merkletreeDef = require('../app/contracts/MerkleTree.json')
const merkleTreeFactory = new ethers.ContractFactory(
  merkletreeDef.abi,
  merkletreeDef.bytecode,
  wallet
)

describe('MerkleTree', () => {
  const n1 = [
    2797420674019184276147165048582285497712289330881034162721130566n,
    8427934753412846593442005159092452875457323490236044611796073070n,
    9469411125398348049965633920124821744896988621636234325004950105n,
    2923302930217940454917090977863765617169883907003492572894363522n,
    0n
  ]
  const n2 = [
    1330609023410448726619682254666295116250929207613706337286188962n,
    7283492628341460800002638659392299735744302068883365423320392808n,
    96864075774826222663476299560881317026395539922755910892839713n,
    2456138780885236327953645884408972334942885107455927146618659151n,
    1n
  ]
  const n3 = [
    6936974700787696040635595887625314144179272410714180932753872117n,
    6250380342377444598507603048104066119476512507053655992814127749n,
    5668013437164926280306746546748473260430823993035190591406122953n,
    1585442726572570137149962979954409407260045685953150336947296067n,
    5n
  ]
  const n4 = [
    5229547711681003634222565892199961035333819119411843822418215696n,
    7706096548158393230435363596458038582375557031601041353397380351n,
    3909458901148920235564639377356912641542827392978411156375333476n,
    1969937445135844943809267310847101382855620527876925674981003198n,
    9n
  ]
  const ns = [n1, n2, n3, n4]

  let hasherContract
  let merkleTreeContract
  let merkleTreeJS

  before('Setup Hasher Library', async () => {
    hasherContract = await hasherFactory.deploy()
  })

  beforeEach('Setup contract for each test', async () => {
    merkleTreeContract = await merkleTreeFactory.deploy(
      merkleTreeConfig.treeDepth,
      stringifyBigInts(merkleTreeConfig.zeroValue),
      hasherContract.address
    )

    await merkleTreeContract.deployed()
    await merkleTreeContract.whitelistAddress(wallet.address)

    merkleTreeJS = createMerkleTree(
      merkleTreeConfig.treeDepth,
      merkleTreeConfig.zeroValue
    )
  })

  it('#Insert', async () => {
    for (let n in ns) {
      const h = mimc7.multiHash(n)

      await merkleTreeContract.insert(h.toString())
      merkleTreeJS.insert(h)
    }

    for (let i = 0; i < ns.length; i++) {
      const leaf = await merkleTreeContract.getLeafAt(i.toString())
      assert.equal(merkleTreeJS.leaves[i].toString(), leaf.toString())
    }
  })

  it('#Update', async () => {
    for (let n in ns) {
      const h = mimc7.multiHash(n)

      await merkleTreeContract.insert(h.toString())
      merkleTreeJS.insert(h)
    }

    const leafIndex = 1
    const newLeafRawValue = [1n, 2n, 3n, 4n, 5n]
    const newLeafValue = mimc7.multiHash(newLeafRawValue)

    // eslint-disable-next-line
    const [path, _] = merkleTreeJS.getPathUpdate(leafIndex)
    await merkleTreeContract.update(
      leafIndex,
      newLeafValue.toString(),
      path.map(x => x.toString())
    )
    merkleTreeJS.update(leafIndex, newLeafValue)

    const newRoot = await merkleTreeContract.getRoot()
    assert.equal(merkleTreeJS.root.toString(), newRoot.toString())
  })

  it('#InvalidUpdate', async () => {
    for (let n in ns) {
      const h = mimc7.multiHash(n)

      await merkleTreeContract.insert(h.toString())
      merkleTreeJS.insert(h)
    }

    try {
      // eslint-disable-next-line
      const [path, _] = merkleTreeJS.getPathUpdate(0)

      await merkleTreeContract.update(
        0,
        n1.toString(),
        path.map(x => x.toString())
      )

      // Line above should throw an exception
      // this assertion should never be reached
      assert.equal(true, false)
    } catch (e) {}
  })

  it('#RootCalculation', async () => {
    let contractRoot

    // Make sure initial root is the same
    contractRoot = await merkleTreeContract.getRoot()
    assert.equal(merkleTreeJS.root.toString(), contractRoot.toString())

    // Insert items and validate the root will be the same
    for (let n in ns) {
      const h = mimc7.multiHash(n)

      await merkleTreeContract.insert(h.toString())
      merkleTreeJS.insert(h)

      contractRoot = await merkleTreeContract.getRoot()
      assert.equal(merkleTreeJS.root.toString(), contractRoot)
    }
  })
})
