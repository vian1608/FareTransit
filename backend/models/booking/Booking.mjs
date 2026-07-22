import { DataTypes } from 'sequelize';
import sequelize from '../../config/database.mjs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOKINGS_FILE = path.join(__dirname, '../../data/bookings.json');

const Booking = sequelize.define('Booking', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  confirmation_code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  passenger_name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  traveller_details: {
    type: DataTypes.JSON,
    allowNull: false
  },
  flight_details: {
    type: DataTypes.JSON,
    allowNull: false
  },
  payment_reference: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'USD'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'FAILED', 'DONE'),
    allowNull: false,
    defaultValue: 'PENDING'
  },
  originalApiPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  internalNotes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  paymentStatus: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'paid'
  },
  
  // -- VIRTUAL FIELDS & ALIASES FOR COMPATIBILITY --
  bookingReference: {
    type: DataTypes.VIRTUAL,
    get() {
      return this.getDataValue('confirmation_code');
    },
    set(value) {
      this.setDataValue('confirmation_code', value);
    }
  },
  customerName: {
    type: DataTypes.VIRTUAL,
    get() {
      return this.getDataValue('passenger_name');
    },
    set(value) {
      this.setDataValue('passenger_name', value);
    }
  },
  passengers: {
    type: DataTypes.VIRTUAL,
    get() {
      return this.getDataValue('traveller_details');
    },
    set(value) {
      this.setDataValue('traveller_details', value);
    }
  },
  flight: {
    type: DataTypes.VIRTUAL,
    get() {
      return this.getDataValue('flight_details');
    },
    set(value) {
      this.setDataValue('flight_details', value);
    }
  },
  transactionId: {
    type: DataTypes.VIRTUAL,
    get() {
      return this.getDataValue('payment_reference');
    },
    set(value) {
      this.setDataValue('payment_reference', value);
    }
  },
  displayedWebsitePrice: {
    type: DataTypes.VIRTUAL,
    get() {
      return this.getDataValue('amount');
    },
    set(value) {
      this.setDataValue('amount', value);
    }
  },
  bookingStatus: {
    type: DataTypes.VIRTUAL,
    get() {
      const status = this.getDataValue('status');
      if (status === 'PENDING') return 'pending';
      if (status === 'DONE') return 'confirmed';
      if (status === 'FAILED') return 'cancelled';
      return 'pending';
    },
    set(value) {
      const val = String(value).toLowerCase();
      if (val === 'pending') this.setDataValue('status', 'PENDING');
      else if (val === 'confirmed' || val === 'completed' || val === 'done') this.setDataValue('status', 'DONE');
      else if (val === 'cancelled' || val === 'failed') this.setDataValue('status', 'FAILED');
    }
  },
  bookingDate: {
    type: DataTypes.VIRTUAL,
    get() {
      return this.getDataValue('created_at') || new Date();
    }
  }
}, {
  tableName: 'bookings',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['confirmation_code']
    }
  ]
});

// JSON fallback file database persistence methods
async function readBookingsFile() {
  try {
    const content = await fs.readFile(BOOKINGS_FILE, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return [];
  }
}

async function writeBookingsFile(data) {
  try {
    await fs.mkdir(path.dirname(BOOKINGS_FILE), { recursive: true });
    await fs.writeFile(BOOKINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write bookings file:', e);
  }
}

function createMockInstance(record) {
  if (!record) return null;
  const instance = {
    ...record,
    get bookingReference() { return this.confirmation_code; },
    get customerName() { return this.passenger_name; },
    get passengers() { return this.traveller_details; },
    get flight() { return this.flight_details; },
    get transactionId() { return this.payment_reference; },
    get displayedWebsitePrice() { return this.amount; },
    get bookingStatus() {
      const status = this.status;
      if (status === 'PENDING') return 'pending';
      if (status === 'DONE') return 'confirmed';
      if (status === 'FAILED') return 'cancelled';
      return 'pending';
    },
    get bookingDate() { return this.created_at || new Date(); },

    toJSON() {
      return {
        ...record,
        bookingReference: this.bookingReference,
        customerName: this.customerName,
        passengers: this.passengers,
        flight: this.flight,
        transactionId: this.transactionId,
        displayedWebsitePrice: this.displayedWebsitePrice,
        bookingStatus: this.bookingStatus,
        bookingDate: this.bookingDate
      };
    },
    get(opt) {
      return this.toJSON();
    },
    save: async function() {
      const list = await readBookingsFile();
      const idx = list.findIndex(b => b.id === record.id);
      if (idx !== -1) {
        const updatedRecord = {
          ...list[idx],
          status: this.status || list[idx].status,
          internalNotes: this.internalNotes !== undefined ? this.internalNotes : list[idx].internalNotes,
          traveller_details: this.traveller_details || this.passengers || list[idx].traveller_details,
          passenger_name: this.passenger_name || this.customerName || list[idx].passenger_name,
          email: this.email || list[idx].email,
          phone: this.phone || list[idx].phone,
          updated_at: new Date()
        };
        list[idx] = updatedRecord;
        await writeBookingsFile(list);
      }
      return this;
    }
  };
  return instance;
}

// Override Sequelize static methods for runtime JSON persistence fallback
const originalCreate = Booking.create;
Booking.create = async function(values, options) {
  if (global.dbConnected) {
    try {
      return await originalCreate.call(Booking, values, options);
    } catch (e) {
      console.error('MySQL database write failed, falling back to JSON local file storage:', e.message);
    }
  }
  const list = await readBookingsFile();
  const newRecord = {
    id: list.length + 1,
    ...values,
    created_at: new Date(),
    updated_at: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  };
  list.push(newRecord);
  await writeBookingsFile(list);
  return createMockInstance(newRecord);
};

const originalFindAll = Booking.findAll;
Booking.findAll = async function(options) {
  if (global.dbConnected) {
    try {
      return await originalFindAll.call(Booking, options);
    } catch (e) {
      console.error('MySQL database read failed, falling back to JSON local file storage:', e.message);
    }
  }
  const list = await readBookingsFile();
  let filtered = [...list];

  if (options && options.where) {
    const where = options.where;
    
    if (where.email) {
      filtered = filtered.filter(b => b.email === where.email);
    }
    if (where.confirmation_code) {
      filtered = filtered.filter(b => b.confirmation_code === where.confirmation_code);
    }
    if (where.status) {
      filtered = filtered.filter(b => b.status === where.status);
    }

    // Check for OR queries (Op.or)
    const symbols = Object.getOwnPropertySymbols(where);
    const orCondition = symbols.length > 0 ? where[symbols[0]] : (where.or || null);
    if (Array.isArray(orCondition)) {
      filtered = list.filter(b => {
        return orCondition.some(cond => {
          if (cond.confirmation_code) {
            return b.confirmation_code === cond.confirmation_code;
          }
          if (cond.email) {
            return b.email === cond.email;
          }
          if (cond.passenger_name) {
            let term = cond.passenger_name;
            if (typeof term === 'object') {
              // Handle Op.like queries
              const keys = Object.getOwnPropertySymbols(term);
              term = keys.length > 0 ? term[keys[0]] : (term.val || '');
            }
            term = String(term).replace(/%/g, '').toLowerCase();
            return b.passenger_name.toLowerCase().includes(term);
          }
          return false;
        });
      });
    }
  }

  if (options && options.order) {
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  return filtered.map(createMockInstance);
};

const originalFindOne = Booking.findOne;
Booking.findOne = async function(options) {
  if (global.dbConnected) {
    try {
      return await originalFindOne.call(Booking, options);
    } catch (e) {
      console.error('MySQL database read failed, falling back to JSON local file storage:', e.message);
    }
  }
  const results = await Booking.findAll(options);
  return results.length > 0 ? results[0] : null;
};

const originalFindByPk = Booking.findByPk;
Booking.findByPk = async function(id, options) {
  if (global.dbConnected) {
    try {
      return await originalFindByPk.call(Booking, id, options);
    } catch (e) {
      console.error('MySQL database read failed, falling back to JSON local file storage:', e.message);
    }
  }
  const list = await readBookingsFile();
  const record = list.find(b => b.id === Number(id));
  return record ? createMockInstance(record) : null;
};

export default Booking;
