import { expect } from 'chai'
import { Model } from '../src/Model'

describe('Model Class', function() {
  type ValueAttributes = {
    a: {
      b: string
      c: { inner: string }
    }
    d: string
    f: { g: string[] }
  }
  const bValue = 'This is B value'
  const dValue = 'And this is D value'

  let instance

  beforeEach(() => {
    class ValueModel extends Model<ValueAttributes>() {}
    instance = new ValueModel({
      a: {
        b: bValue,
        c: {
          inner: 'yes'
        }
      },
      d: dValue,
      f: {
        g: []
      }
    })
  })

  describe('#get', function() {
    it('should return the value setted on the attributes', function() {
      expect(instance.get('d')).to.equal(dValue)
    })

    it('should return undefined if the value does not exist', function() {
      expect(instance.get('nonsense')).to.be.eq(undefined)
    })
  })

  describe('#getIn', function() {
    it('should return the value setted on the attributes', function() {
      expect(instance.getIn(['a', 'b'])).to.equal(bValue)
    })

    it('should return null if part of the key path does not exist', function() {
      expect(instance.getIn(['a', 'nonsense', 'inner'])).to.be.eq(null)
    })
  })

  describe('#set', function() {
    it('should set the top level key with the value supplied', function() {
      instance.set('new key', 22)
      expect(instance.get('new key')).to.equal(22)
    })

    it('should return the instance (chainable)', function() {
      expect(instance.set('key', 'value')).to.equal(instance)
    })
  })

  describe('#setIn', function() {
    it('set the nested value on the attributes', function() {
      instance.setIn(['a', 'b'], 'NEW VALUE')
      expect(instance.getIn(['a', 'b'])).to.equal('NEW VALUE')
    })

    it('should return the instance (chainable)', function() {
      expect(instance.setIn(['f', 'g'], 'NEW VALUE')).to.equal(instance)
    })

    it('should return null if part of the key path does not exist', function() {
      expect(instance.setIn(['a', 'nonsense', 'inner'], 22)).to.be.eq(null)
    })
  })
})
