const path = require('path')
const { assert } = require('chai')
const compiler = require('circom')
const { stringifyBigInts } = require('../_build/utils/helpers')
const { Circuit } = require('snarkjs')
const { hashLeftRight } = require('../_build/utils/crypto')

const {
  randomPrivateKey,
  privateToPublicKey,
  encrypt,
  sign,
  ecdh,
  multiHash,
  babyJubJubPrivateKey
} = require('../_build/utils/crypto')

describe('Circom Ciruits', () => {

  describe('Hasher', () => {
    it('#HashOutput', async () => {
      const circuitDef = await compiler(path.join(__dirname, 'circuits', 'hashleftright_test.circom'))
      const circuit = new Circuit(circuitDef)

      const left = 32767n
      const right = 1337n

      const circuitInputs = {
        'left': stringifyBigInts(left),
        'right': stringifyBigInts(right)
      }

      const witness = circuit.calculateWitness(circuitInputs)

      const outputIdx = circuit.getSignalIdx('main.hash')
      const output = witness[outputIdx]

      const outputJS = hashLeftRight(left, right)

      assert.equal(output.toString(), outputJS.toString())
    })
  })

  describe('Decrypt', () => {
    it('#Decryption', async () => {
      const circuitDef = await compiler(path.join(__dirname, 'circuits', 'decrypt_test.circom'))
      const circuit = new Circuit(circuitDef)

      const sk1 = randomPrivateKey()
      const sk2 = randomPrivateKey()

      const pk1 = privateToPublicKey(sk1)
      const pk2 = privateToPublicKey(sk2)

      const sharedKey = ecdh(sk2, pk1)

      const msg = [3n, 4n, 5n, 32767n]

      const encryptedMsg = encrypt(msg, sk1, pk2)

      const circuitInputs = {
        'message': stringifyBigInts(encryptedMsg),
        'private_key': stringifyBigInts(sharedKey)
      }

      const witness = circuit.calculateWitness(circuitInputs)

      // Get the outputs
      for (let i = 0; i < msg.length; i++) {
        const idx = circuit.outputIdx(i)
        assert.equal(msg[i].toString(), witness[idx].toString())
      }
    })
  })

  describe('Verify Signature', () => {
    it('#Verification', async () => {
      const circuitDef = await compiler(path.join(__dirname, 'circuits', 'verify_signature_test.circom'))
      const circuit = new Circuit(circuitDef)

      const sk1 = randomPrivateKey()
      const pk1 = privateToPublicKey(sk1)

      const msg = [3n, 4n, 5n, 32767n]
      const msgHash = multiHash(msg)

      const signature = sign(sk1, msgHash)

      const circuitInputs = {
        'from_x': stringifyBigInts(pk1[0]),
        'from_y': stringifyBigInts(pk1[1]),
        'R8x': stringifyBigInts(signature.R8[0]),
        'R8y': stringifyBigInts(signature.R8[1]),
        'S': stringifyBigInts(signature.S),
        'preimage': stringifyBigInts(msg)
      }

      // If circuit can calculate witness
      // then verification has passed
      circuit.calculateWitness(circuitInputs)

      try {
        const invalidCircuitInputs = {
          'from_x': stringifyBigInts(0n),
          'from_y': stringifyBigInts(1n),
          'R8x': stringifyBigInts(signature.R8[0]),
          'R8y': stringifyBigInts(signature.R8[1]),
          'S': stringifyBigInts(signature.S),
          'preimage': stringifyBigInts(msg)
        }
        circuit.calculateWitness(invalidCircuitInputs)

        // This line shouldn't be reached
        throw new Error('Invalid signature is recognized as valid!')
      } catch (e) {}
    })
  })

  describe('PublicKey', () => {
    it('#KeyDerivation', async () => {
      const circuitDef = await compiler(path.join(__dirname, 'circuits', 'publickey_derivation_test.circom'))
      const circuit = new Circuit(circuitDef)

      const sk1 = randomPrivateKey()
      const pk1 = privateToPublicKey(sk1)

      const circuitInputs = {
        'private_key': stringifyBigInts(
          babyJubJubPrivateKey(sk1)
        )
      }

      const witness = circuit.calculateWitness(circuitInputs)

      assert.equal(pk1[0].toString(), witness[circuit.outputIdx(0)].toString())
      assert.equal(pk1[1].toString(), witness[circuit.outputIdx(1)].toString())
    })
  })

  describe('Ecdh', () => {
    it('#KeyDerivation', async () => {
      const circuitDef = await compiler(path.join(__dirname, 'circuits', 'ecdh_test.circom'))
      const circuit = new Circuit(circuitDef)

      const sk1 = randomPrivateKey()
      const pk1 = privateToPublicKey(sk1)

      const sk2 = randomPrivateKey()
      const pk2 = privateToPublicKey(sk2)

      const sharedKey = ecdh(sk2, pk1)

      const circuitInputs = {
        'private_key': stringifyBigInts(
          babyJubJubPrivateKey(sk1)
        ),
        'public_key': stringifyBigInts(pk2)
      }

      const witness = circuit.calculateWitness(circuitInputs)

      const idx = circuit.outputIdx(0)
      assert.equal(sharedKey.toString(), witness[idx].toString())
    })
  })
})

