# Lead Tracker - Frontend

## Project Setup

This is the frontend application for the Lead Tracker system built with Next.js 14+ (App Router), TypeScript, and Tailwind CSS.

## Features Implemented

### User Module
- ✅ Authentication (Login)
- ✅ Super Admin Dashboard
- ✅ Regular User Dashboard
- ✅ Role-based routing
- ✅ User management (Super Admin can create users)
- ✅ Role management (Super Admin can create roles)

## Project Structure

```
frontend/
├── app/
│   ├── dashboard/          # Super Admin Dashboard
│   ├── user-dashboard/      # Regular User Dashboard
│   ├── login/              # Login Page
│   ├── layout.tsx          # Root Layout
│   ├── page.tsx            # Home (redirects based on auth)
│   └── providers.tsx       # React Query Provider
├── components/
│   └── ui/                 # Reusable UI Components
│       ├── Button.tsx
│       ├── Input.tsx
│       └── Card.tsx
├── lib/
│   ├── api.ts              # API client and endpoints
│   ├── auth.ts             # Authentication utilities
│   └── utils.ts            # Utility functions
└── types/
    └── index.ts            # TypeScript type definitions
```

## Environment Variables

Create a `.env.local` file in the frontend directory:

```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_CRM_BACKEND_URL=http://localhost:3000
NEXT_PUBLIC_CRM_FRONTEND_URL=http://localhost:5173
```

**SSO Configuration:**
- `NEXT_PUBLIC_CRM_BACKEND_URL`: URL of the CRM backend for SSO token verification
- `NEXT_PUBLIC_CRM_FRONTEND_URL`: URL of the CRM frontend (for redirects on error)

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Key Features

### Authentication
- JWT-based authentication
- Token stored in cookies
- Automatic token refresh handling
- Protected routes based on user role

### User Roles
- **Super Admin**: Full access, can create users and roles
- **Regular Users**: Limited access, different dashboard

### API Integration
- Axios-based API client
- Automatic token injection
- Error handling and redirects
- React Query for data fetching

## Next Steps

1. Set up backend API
2. Implement lead management module
3. Add status management
4. Implement bulk upload
5. Add analytics and reporting
