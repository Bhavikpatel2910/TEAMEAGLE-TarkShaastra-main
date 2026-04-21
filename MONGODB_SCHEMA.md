# MongoDB Schema Documentation - StampedeShield Project

## Overview
This document outlines the complete MongoDB database schema for the StampedeShield crowd safety intelligence system. The project uses Mongoose ODM for MongoDB with 5 main collections.

---

## Collections & Schemas

### 1. **Users Collection**
Stores user account information with role-based access control.

```javascript
{
  _id: ObjectId,
  name: String,
  email: String,
  password: String (hashed),
  role: String (enum: ['police', 'transport', 'admin']),
  createdAt: Date (implicit)
}
```

**Fields:**
- `_id`: Unique MongoDB ObjectId
- `name`: User's full name
- `email`: User's email address (unique)
- `password`: Hashed password (bcrypt recommended)
- `role`: User role for authorization
  - `police`: Police department operators
  - `transport`: Transport/traffic authority
  - `admin`: System administrators

**Indexes:** None explicitly defined

---

### 2. **Corridors Collection**
Defines physical corridors/pathways being monitored (temples, venues, streets, etc.).

```javascript
{
  _id: ObjectId,
  name: String (required, unique, trimmed),
  width: Number (required, min: 0.5),
  length: Number (default: 0, min: 0),
  capacity: Number (default: 0, min: 0),
  timestamps: {
    createdAt: Date,
    updatedAt: Date
  }
}
```

**Fields:**
- `_id`: Unique MongoDB ObjectId
- `name`: Corridor identifier (temple name, street name, etc.) - UNIQUE
- `width`: Physical width in meters (used in CPI calculations)
- `length`: Physical length in meters
- `capacity`: Maximum safe capacity (people)
- `createdAt`: Timestamp of creation
- `updatedAt`: Timestamp of last update

**Indexes:**
- `name` (ascending) - for fast lookups by corridor name
- `createdAt` (descending) - for sorting by creation time

---

### 3. **SensorData Collection**
Stores real-time sensor readings from corridors (entry/exit rates, density, weather, etc.).

```javascript
{
  _id: ObjectId,
  corridorId: String (required, indexed),
  entryRate: Number (default: 0, min: 0),
  exitRate: Number (default: 0, min: 0),
  density: Number (default: 0, min: 0),
  width: Number (default: 0.5, min: 0.5),
  vehicleCount: Number (default: 0, min: 0),
  transportBurst: Number (default: 0, min: 0),
  transportArrivalBurst: Number (default: 0, min: 0),
  weather: Mixed (default: 'Clear'),
  weatherPenalty: Number (default: 0, min: 0),
  festival: Number (default: 0, min: 0),
  festivalPeak: Number (default: 0, min: 0),
  cpi: Number (default: 0, min: 0),
  pressureIndex: Number (default: 0, min: 0),
  riskLevel: String (default: 'LOW'),
  timestamp: Date (default: Date.now, indexed)
}
```

**Fields:**
- `_id`: Unique MongoDB ObjectId
- `corridorId`: Reference to Corridor collection
- `entryRate`: People entering per minute
- `exitRate`: People exiting per minute
- `density`: Current crowd density (people/m²)
- `width`: Corridor width (m) - used for CPI calculation
- `vehicleCount`: Number of vehicles present
- `transportBurst`: Sudden vehicle arrivals (boolean normalized)
- `transportArrivalBurst`: Additional transport arrival events
- `weather`: Weather condition ('Clear', 'Rain', 'Heat', etc.)
- `weatherPenalty`: Calculated penalty based on weather
- `festival`: Festival event indicator (0-1 scale)
- `festivalPeak`: Peak festival intensity
- `cpi`: Calculated Crowd Pressure Index (0-200+)
- `pressureIndex`: Alias for CPI
- `riskLevel`: Computed risk status (LOW, MODERATE, HIGH, CRITICAL)
- `timestamp`: When reading was taken

**Indexes:**
- `corridorId` (ascending) - for filtering by corridor
- `timestamp` (ascending) - for time-based queries
- `corridorId` + `timestamp` (composite, 1, -1) - for fast corridor-time range queries

**CPI Calculation Formula:**
```
CPI = (8.7 × density) × 
      (0.42 × (netInflow / width)) × 
      (1.9 × vehicleCount) × 
      (10 × transportBurst) × 
      (7 × festivalPeak) × 
      (1 + weatherPenalty/100)

where netInflow = max(0, entryRate - exitRate)
```

---

### 4. **Alerts Collection**
Stores safety alerts triggered by high CPI values or anomalies.

```javascript
{
  _id: ObjectId,
  corridorId: String (indexed),
  level: String,
  message: String,
  acknowledged: Boolean (default: false, indexed),
  createdAt: Date (default: Date.now, indexed)
}
```

**Fields:**
- `_id`: Unique MongoDB ObjectId
- `corridorId`: Reference to affected Corridor
- `level`: Alert severity
  - `SAFE`: CPI < 50
  - `MODERATE`: 50 ≤ CPI < 120
  - `HIGH`: 120 ≤ CPI < 200
  - `CRITICAL`: CPI ≥ 200
- `message`: Alert description (auto-generated or custom)
- `acknowledged`: Whether alert has been reviewed by operator
- `createdAt`: When alert was triggered

**Indexes:**
- `corridorId` (ascending)
- `acknowledged` (ascending)
- `createdAt` (descending)
- `corridorId` + `acknowledged` + `createdAt` (composite, 1, 1, -1) - for common dashboard queries

---

### 5. **EventLog Collection** (Currently Empty)
Reserved for future event tracking (user actions, system events, etc.).

**Recommended Schema:**
```javascript
{
  _id: ObjectId,
  userId: ObjectId (reference to User),
  action: String (e.g., 'login', 'acknowledge_alert', 'run_prediction'),
  resource: String (e.g., 'alert', 'corridor', 'user'),
  resourceId: String,
  details: Mixed (action-specific details),
  ipAddress: String,
  timestamp: Date (default: Date.now, indexed)
}
```

---

## Data Relationships

```
┌─────────────────┐
│     Users       │
│─────────────────│
│ _id (PK)        │
│ name            │
│ email           │
│ role            │
└────────┬────────┘
         │
         │ (views/manages)
         │
┌────────▼────────────────────────┐
│      Corridors                  │
│─────────────────────────────────│
│ _id (PK)                        │
│ name (UNIQUE)                   │
│ width, length, capacity         │
└────────┬────────────────────────┘
         │
         │ corridorId (1:N)
         │
┌────────▼──────────────────────────────────┐
│    SensorData (Time Series)               │
│──────────────────────────────────────────│
│ _id (PK)                                  │
│ corridorId (FK → Corridors)               │
│ entryRate, exitRate, density              │
│ cpi, pressureIndex, riskLevel             │
│ timestamp                                 │
└────────┬──────────────────────────────────┘
         │
         │ (triggers)
         │
┌────────▼──────────────────────┐
│      Alerts                   │
│───────────────────────────────│
│ _id (PK)                      │
│ corridorId (FK)               │
│ level, message                │
│ acknowledged                  │
└───────────────────────────────┘
```

---

## Database Statistics & Performance

### Collection Sizes (Typical)
- **Users**: Small (10-100 documents)
- **Corridors**: Small-Medium (5-50 documents)
- **SensorData**: Large (thousands to millions - time series)
- **Alerts**: Medium (hundreds to thousands)
- **EventLog**: Medium (for future use)

### Query Performance Tips
1. **SensorData queries**: Use the composite index on `(corridorId, timestamp)` for range queries
2. **Alert queries**: Use composite index on `(corridorId, acknowledged, createdAt)` for dashboard filtering
3. **Time-series data**: Implement data archival (move old SensorData to archive collection after 3-6 months)
4. **Pagination**: Always limit SensorData queries to prevent memory issues

### Recommended TTL Indexes
Consider adding TTL (Time To Live) indexes for automatic data cleanup:

```javascript
// Auto-delete sensor data after 6 months
db.sensordatas.createIndex({ timestamp: 1 }, { expireAfterSeconds: 15552000 })

// Auto-delete alerts after 1 year
db.alerts.createIndex({ createdAt: 1 }, { expireAfterSeconds: 31536000 })
```

---

## CPI Risk Level Mapping

| CPI Range | Risk Level | Description | Action |
|-----------|-----------|-------------|--------|
| 0-50 | SAFE | Normal conditions | Monitor |
| 50-120 | MODERATE | Increased density | Alert operators |
| 120-200 | HIGH | High risk of stampede | Immediate intervention |
| 200+ | CRITICAL | Imminent stampede danger | Emergency response |

---

## Validation Rules

### Numeric Fields
- All `*Rate` fields: >= 0
- `width`, `density`, `vehicleCount`: >= 0, decimals allowed
- `cpi`, `pressureIndex`: 0-1000 range typical
- `weatherPenalty`: 0-50

### Enum Fields
- `User.role`: 'police' | 'transport' | 'admin'
- `Alert.level`: 'SAFE' | 'MODERATE' | 'HIGH' | 'CRITICAL'
- `SensorData.weather`: 'Clear' | 'Rain' | 'Heat' | custom values

### Required Fields
- `Corridor.name`: Required, unique, trimmed
- `Corridor.width`: Required, >= 0.5
- `SensorData.corridorId`: Required
- `Alert.corridorId`: Required

---

## Backup & Disaster Recovery

### Recommended Backup Strategy
```bash
# Daily incremental backups
mongodump --db teameagle --out /backups/$(date +%Y%m%d)

# Weekly full backups
mongodump --db teameagle --out /backups/weekly_$(date +%Y%m%d)

# Archive old sensor data
db.sensordatas.deleteMany({ timestamp: { $lt: ISODate("2024-01-01") } })
```

---

## Usage Examples

### Create a Corridor
```javascript
db.corridors.insertOne({
  name: "Temple Main Gate",
  width: 8.5,
  length: 50,
  capacity: 5000,
  timestamps: { createdAt: new Date(), updatedAt: new Date() }
})
```

### Insert Sensor Data
```javascript
db.sensordatas.insertOne({
  corridorId: "ObjectId(...)",
  entryRate: 120,
  exitRate: 85,
  density: 4.2,
  width: 8.5,
  vehicleCount: 2,
  transportBurst: 0,
  weather: "Clear",
  festivalPeak: 0.8,
  cpi: 156.3,
  riskLevel: "HIGH",
  timestamp: new Date()
})
```

### Query Recent High-Risk Alerts
```javascript
db.alerts.find({
  level: { $in: ["HIGH", "CRITICAL"] },
  acknowledged: false,
  createdAt: { $gte: ISODate("2024-01-01") }
}).sort({ createdAt: -1 }).limit(20)
```

### Get CPI Trend for Corridor
```javascript
db.sensordatas.find({
  corridorId: "corridor-123",
  timestamp: {
    $gte: ISODate("2024-01-01"),
    $lt: ISODate("2024-01-02")
  }
}).sort({ timestamp: 1 })
```

---

## Connection String Format
```
mongodb://[username]:[password]@[host]:[port]/teameagle?authSource=admin
```

---

## Notes for Development

1. **Strict Mode**: SensorData uses `strict: false` to allow flexible field additions
2. **Timestamps**: Corridor has automatic timestamps via Mongoose
3. **Indexing**: Always query on indexed fields for better performance
4. **Data Archival**: Implement archival strategy for SensorData to manage collection size
5. **Replication**: For production, enable MongoDB replica sets for redundancy
