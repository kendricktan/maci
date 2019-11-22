// @flow
import type { ContractAddresses } from './settings'

const ethers = require('ethers')
const { getContractAddresses } = require('./settings')
const maciConfig = require('../../maci-config')

const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545')
const privateKey = maciConfig.ganacheConfig.privateKey
const wallet = new ethers.Wallet(privateKey, provider)

const contractAddresses: ContractAddresses = getContractAddresses()

// Read-only contract
// const maciContract = new ethers.Contract(maciContractAddress, maciContractDef.abi, provider)
const maciContractDef = require('../../app/contracts/MACI.json')
const signUpTokenContractDef = require('../../app/contracts/SignUpToken.json')
const merkleTreeContractDef = require('../../app/contracts/MerkleTree.json')

const maciContract = new ethers.Contract(
  contractAddresses.MACI_CONTRACT_ADDRESS,
  maciContractDef.abi,
  wallet
)
const cmdTreeContract = new ethers.Contract(
  contractAddresses.CMD_TREE_ADDRESS,
  merkleTreeContractDef.abi,
  wallet
)
const signUpTokenContract = new ethers.Contract(
  contractAddresses.SIGN_UP_TOKEN_ADDRESS,
  signUpTokenContractDef.abi,
  wallet
)

module.exports = {
  contractAddresses,
  maciContract,
  cmdTreeContract,
  signUpTokenContract
}
