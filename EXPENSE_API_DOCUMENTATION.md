# Expense Tracking API Documentation

## Overview
The Expense Tracking API provides comprehensive functionality for managing business expenses, monthly summaries, and expense categories. All endpoints require authentication and active subscription.

## Base URL
```
https://your-api-domain.com/firebase
```

## Authentication
All endpoints require a valid JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### 1. Expense Management

#### Add Expense
**POST** `/expenses/:userId/:locationId/:monthYear`

Add a new expense to a specific location and month.

**Request Body:**
```json
{
  "date": "2024-01-15",
  "category": "Office Supplies",
  "vendor": "Staples",
  "amount": 25.99,
  "paymentMethod": "Credit Card",
  "notes": "Office supplies for Q1"
}
```

**Response:**
```json
{
  "success": true,
  "expense": {
    "id": "expense-123",
    "userId": "user-123",
    "locationId": "location-456",
    "monthYear": "2024-01",
    "date": "2024-01-15",
    "category": "Office Supplies",
    "vendor": "Staples",
    "amount": 25.99,
    "paymentMethod": "Credit Card",
    "notes": "Office supplies for Q1",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "monthlyData": {
    "locationId": "location-456",
    "month": "2024-01",
    "expenses": { "expense-123": { ... } },
    "monthlyTotals": { ... }
  },
  "monthlyTotals": {
    "totalRevenue": 5000.00,
    "totalExpenses": 25.99,
    "netProfit": 4974.01,
    "expensesByCategory": {
      "Office Supplies": 25.99
    },
    "transactionCount": 1,
    "lastUpdated": "2024-01-15T10:30:00.000Z"
  }
}
```

#### Get Monthly Expenses
**GET** `/expenses/:userId/:locationId/:monthYear`

Retrieve all expenses for a specific location and month.

**Response:**
```json
{
  "locationId": "location-456",
  "month": "2024-01",
  "expenses": {
    "expense-123": {
      "id": "expense-123",
      "userId": "user-123",
      "locationId": "location-456",
      "monthYear": "2024-01",
      "date": "2024-01-15",
      "category": "Office Supplies",
      "vendor": "Staples",
      "amount": 25.99,
      "paymentMethod": "Credit Card",
      "notes": "Office supplies for Q1",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  },
  "monthlyTotals": {
    "totalRevenue": 5000.00,
    "totalExpenses": 25.99,
    "netProfit": 4974.01,
    "expensesByCategory": {
      "Office Supplies": 25.99
    },
    "transactionCount": 1,
    "lastUpdated": "2024-01-15T10:30:00.000Z"
  }
}
```

#### Update Expense
**PATCH** `/expenses/:userId/:locationId/:monthYear/:expenseId`

Update an existing expense.

**Request Body:**
```json
{
  "amount": 30.99,
  "notes": "Updated office supplies order"
}
```

**Response:**
```json
{
  "success": true,
  "expense": {
    "id": "expense-123",
    "userId": "user-123",
    "locationId": "location-456",
    "monthYear": "2024-01",
    "date": "2024-01-15",
    "category": "Office Supplies",
    "vendor": "Staples",
    "amount": 30.99,
    "paymentMethod": "Credit Card",
    "notes": "Updated office supplies order",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T11:00:00.000Z"
  },
  "monthlyTotals": {
    "totalRevenue": 5000.00,
    "totalExpenses": 30.99,
    "netProfit": 4969.01,
    "expensesByCategory": {
      "Office Supplies": 30.99
    },
    "transactionCount": 1,
    "lastUpdated": "2024-01-15T11:00:00.000Z"
  }
}
```

#### Delete Expense
**DELETE** `/expenses/:userId/:locationId/:monthYear/:expenseId`

Delete an expense.

**Response:**
```json
{
  "success": true,
  "monthlyTotals": {
    "totalRevenue": 5000.00,
    "totalExpenses": 0.00,
    "netProfit": 5000.00,
    "expensesByCategory": {},
    "transactionCount": 0,
    "lastUpdated": "2024-01-15T11:30:00.000Z"
  }
}
```

#### Import Expenses
**POST** `/expenses/:userId/:locationId/:monthYear/import`

Import multiple expenses from CSV data.

**Request Body:**
```json
{
  "expenses": [
    {
      "date": "2024-01-16",
      "category": "Marketing",
      "vendor": "Google Ads",
      "amount": 150.00,
      "paymentMethod": "Credit Card",
      "notes": "January advertising campaign"
    },
    {
      "date": "2024-01-17",
      "category": "Utilities",
      "vendor": "Electric Company",
      "amount": 89.50,
      "paymentMethod": "ACH",
      "notes": "Monthly electricity bill"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "imported": 2,
  "failed": 0,
  "errors": [],
  "monthlyData": {
    "locationId": "location-456",
    "month": "2024-01",
    "expenses": {
      "expense-124": { ... },
      "expense-125": { ... }
    },
    "monthlyTotals": { ... }
  },
  "monthlyTotals": {
    "totalRevenue": 5000.00,
    "totalExpenses": 239.50,
    "netProfit": 4760.50,
    "expensesByCategory": {
      "Marketing": 150.00,
      "Utilities": 89.50
    },
    "transactionCount": 2,
    "lastUpdated": "2024-01-15T12:00:00.000Z"
  }
}
```

### 2. Monthly Summaries

#### Get Location Monthly Summary
**GET** `/monthly-summary/:userId/:locationId/:monthYear`

Get the monthly summary for a specific location and month.

**Response:**
```json
{
  "userId": "user-123",
  "locationId": "location-456",
  "monthYear": "2024-01",
  "totalRevenue": 5000.00,
  "totalExpenses": 239.50,
  "netProfit": 4760.50,
  "expensesByCategory": {
    "Marketing": 150.00,
    "Utilities": 89.50
  },
  "transactionCount": 2,
  "lastUpdated": "2024-01-15T12:00:00.000Z"
}
```

#### Get All Monthly Summaries
**GET** `/monthly-summary/:userId`

Get all monthly summaries for a user across all locations.

**Response:**
```json
{
  "location-456": {
    "2024-01": {
      "userId": "user-123",
      "locationId": "location-456",
      "monthYear": "2024-01",
      "totalRevenue": 5000.00,
      "totalExpenses": 239.50,
      "netProfit": 4760.50,
      "expensesByCategory": {
        "Marketing": 150.00,
        "Utilities": 89.50
      },
      "transactionCount": 2,
      "lastUpdated": "2024-01-15T12:00:00.000Z"
    }
  }
}
```

#### Calculate Monthly Summary
**POST** `/monthly-summary/:userId/:locationId/:monthYear`

Force recalculation of monthly summary.

**Response:**
```json
{
  "userId": "user-123",
  "locationId": "location-456",
  "monthYear": "2024-01",
  "totalRevenue": 5000.00,
  "totalExpenses": 239.50,
  "netProfit": 4760.50,
  "expensesByCategory": {
    "Marketing": 150.00,
    "Utilities": 89.50
  },
  "transactionCount": 2,
  "lastUpdated": "2024-01-15T12:00:00.000Z"
}
```

### 3. Expense Categories

#### Get Expense Categories
**GET** `/expense-categories/:userId`

Get all expense categories for a user.

**Response:**
```json
{
  "categories": [
    "Office Supplies",
    "Utilities",
    "Marketing",
    "Fuel/Transport",
    "Equipment",
    "Maintenance",
    "Insurance",
    "Professional Services",
    "Rent",
    "Software",
    "Travel",
    "Meals",
    "Other"
  ],
  "customCategories": [
    "Custom Category 1",
    "Custom Category 2"
  ],
  "lastUpdated": "2024-01-15T10:00:00.000Z"
}
```

#### Add Custom Category
**POST** `/expense-categories/:userId`

Add a custom expense category.

**Request Body:**
```json
{
  "category": "Custom Category Name"
}
```

**Response:**
```json
{
  "success": true,
  "categories": [
    "Office Supplies",
    "Utilities",
    "Marketing",
    "Fuel/Transport",
    "Equipment",
    "Maintenance",
    "Insurance",
    "Professional Services",
    "Rent",
    "Software",
    "Travel",
    "Meals",
    "Other",
    "Custom Category Name"
  ]
}
```

## Data Validation

### Expense Data Schema
```json
{
  "date": "string (ISO date format, required)",
  "category": "string (1-100 characters, required)",
  "vendor": "string (2-200 characters, required)",
  "amount": "number (positive, max 999999.99, 2 decimal places, required)",
  "paymentMethod": "string (1-50 characters, required)",
  "notes": "string (max 500 characters, optional)"
}
```

### Validation Rules
- **Date**: Must be in YYYY-MM-DD format
- **Category**: Required, 1-100 characters
- **Vendor**: Required, 2-200 characters
- **Amount**: Required, positive number, max $999,999.99, 2 decimal places
- **Payment Method**: Required, 1-50 characters
- **Notes**: Optional, max 500 characters

## Error Responses

### Validation Error (400)
```json
{
  "error": "Validation failed",
  "details": [
    "Date must be in YYYY-MM-DD format",
    "Amount must be greater than 0"
  ]
}
```

### Authentication Error (401)
```json
{
  "error": "Invalid or expired token"
}
```

### Authorization Error (403)
```json
{
  "error": "Access denied: You can only manage your own expenses"
}
```

### Not Found Error (404)
```json
{
  "error": "Expense not found"
}
```

### Server Error (500)
```json
{
  "error": "Internal server error"
}
```

## Rate Limiting

- **Global Rate Limit**: 200 requests per 15 minutes per IP
- **Authentication Endpoints**: 5 requests per 15 minutes per IP
- **Expense Operations**: Subject to global rate limit

## Security Features

- **User Ownership Validation**: Users can only access their own data
- **Location Validation**: Expenses must belong to user's locations
- **Input Sanitization**: All inputs are sanitized and validated
- **JWT Authentication**: All endpoints require valid JWT tokens
- **Subscription Validation**: Active subscription required for all operations

## Database Structure

### Expenses
```
expenses/
  {userId}/
    {locationId}/
      {monthYear}/
        {expenseId}: {
          id, userId, locationId, monthYear,
          date, category, vendor, amount,
          paymentMethod, notes, createdAt, updatedAt
        }
```

### Monthly Summaries
```
monthly-summaries/
  {userId}/
    {locationId}/
      {monthYear}: {
        userId, locationId, monthYear,
        totalRevenue, totalExpenses, netProfit,
        expensesByCategory, transactionCount, lastUpdated
      }
```

### Expense Categories
```
expense-categories/
  {userId}: {
    categories: [string],
    customCategories: [string],
    lastUpdated: string
  }
```

## Integration with Analytics

The expense tracking system integrates with the existing analytics system:

- **Revenue Data**: Monthly summaries pull revenue data from analytics records
- **Net Profit Calculation**: `netProfit = totalRevenue - totalExpenses`
- **Location Tracking**: Expenses are linked to specific locations and TSP IDs
- **Monthly Aggregation**: Summaries are calculated per location per month

## Testing

Use the provided test script to verify endpoint functionality:

```bash
node test-expense-endpoints.js
```

**Note**: Update the `BASE_URL` and authentication tokens for your environment.
