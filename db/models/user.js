'use strict';
const { Model } = require('sequelize');

const { getHash, randomSalt } = require('../../server/utils/crypto');

module.exports = (sequelize, DataTypes) => {
  const SENSITIVE_ATTRS = [
    'salt',
    'hash',
  ];

  class User extends Model {
    static associate({ Media }) {
      User.hasOne(Media, { foreignKey: 'user_id', as: 'media' });

      // "Self" view: full (minus sensitive) + lightweight loyalty include.
      User.addScope('privateProfile', {
        attributes: { exclude: SENSITIVE_ATTRS },
        include: [],
      });
    }

    async matchPassword(password) {
      if (!this.salt) return false;
      let resultHash = await getHash(password, this.salt);
      return resultHash === this.hash;
    }

    async setPassword(password) {
      this.salt = await randomSalt();
      this.hash = await getHash(password, this.salt);
    }
  }

  User.init(
    {
      firstName: DataTypes.STRING,
      lastName: DataTypes.STRING,
      email: DataTypes.STRING,
      salt: DataTypes.STRING,
      hash: DataTypes.STRING,
      role: {
        type: DataTypes.ENUM('client', 'admin'),
      },
    },
    {
      sequelize,
      modelName: 'User',
      underscored: true,

      // DB-level protection everywhere unless a query overrides it.
      // defaultScope: {
      //   attributes: { exclude: SENSITIVE_ATTRS },
      // },
    }
  );

  User.beforeSave((instance, options) => {
    if (Array.isArray(instance.otherPhones)) {
      instance.otherPhones = [...new Set(instance.otherPhones)];
    }
  });

  // Override toJSON to exclude sensitive fields
  User.prototype.toJSON = function () {
    const values = Object.assign({}, this.get());
    delete values.salt;
    delete values.hash;
    return values;
  };

  return User;
};

// SCOPE USAGE

// const scope = someCondition ? 'privateProfile' : 'publicProfile';
// const user = await User.scope(scope).findByPk(id);
