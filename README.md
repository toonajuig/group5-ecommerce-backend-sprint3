# Group 5 E-commerce — Backend (Sprint 3)

REST API for the Group 5 e-commerce platform. Built with Express 5 and MongoDB
(Mongoose), using JWT-in-cookie authentication. Serves the
[frontend client](../group5-ecommerce-sprint2).

## Tech Stack

- **Express 5** — HTTP server & routing
- **MongoDB** + **Mongoose 9** — database & ODM
- **jsonwebtoken** — JWT auth, stored in an HTTP-only `accessToken` cookie
- **bcrypt** — password hashing
- **helmet**, **cors**, **express-rate-limit** — security middleware
- **cookie-parser** — reads the auth cookie
- **dotenv** — environment configuration
- ES Modules (`"type": "module"`)

## Getting Started

### Prerequisites
- Node.js 20+ (uses `--env-file` and `--watch`)
- A MongoDB connection string

### Install & run

```bash
npm install
npm run dev
```

The server starts on `http://localhost:3000` by default.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start with `--watch` and load env from `.env` |
| `npm start` | Start the server (`node src/server.js`) |
| `npm run userseed` | Seed mock users into the database |

## Environment Variables

Create a `.env` file in the project root:

```bash
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/   # required
JWT_SECRET=your-secret-key                                # required
PORT=3000                                                 # optional, defaults to 3000
```

The app connects to the `group5_ecommerce` database
(see [src/config/mongoDB.js](src/config/mongoDB.js)) and exits if `MONGODB_URI`
is missing.

## Project Structure

```
src/
├── server.js              # App entry: middleware, routes, DB connect, listen
├── config/
│   ├── mongoDB.js         # Mongoose connection
│   └── cors.config.js     # Allowed origins (credentials enabled)
├── middleware/
│   ├── authUser.js        # authUser (verify JWT) + adminOnly guard
│   ├── error.middleware.js# Central error handler
│   └── rateLimiter.js     # 500 requests / 15 min per IP
├── modules/               # Feature modules (controller + model)
│   ├── user/              # users, addresses
│   ├── products/
│   ├── categories/
│   ├── carts/
│   ├── order/             # orders + order items
│   └── admin/             # admin stats & listings
├── routes/                # Express routers, mounted under /api
└── utils/stock.utils.js   # Stock helpers
```

## Authentication

- Login (`POST /api/users/login`) sets an HTTP-only `accessToken` cookie containing a signed JWT.
- `authUser` middleware reads that cookie, verifies it with `JWT_SECRET`, and attaches
  `req.user = { userId, role }`.
- `adminOnly` middleware requires `req.user.role === "admin"`.
- The frontend must send requests with credentials so the cookie is included; allowed
  origins are configured in [src/config/cors.config.js](src/config/cors.config.js).

## API Reference

All routes are mounted under `/api`. Access levels:
**Public** (no auth) · **Auth** (logged-in user) · **Admin** (admin role).

### Users — `/api/users`

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| POST | `/` | Public | Register a new user |
| POST | `/login` | Public | Log in, set auth cookie |
| POST | `/logout` | Public | Clear auth cookie |
| GET | `/profile` | Auth | Get current user profile |
| PUT | `/me` | Auth | Update own profile |
| PUT | `/me/password` | Auth | Change own password |
| GET | `/me/addresses` | Auth | List own addresses |
| POST | `/me/addresses` | Auth | Add an address |
| PUT | `/me/addresses/:addressId` | Auth | Update an address |
| DELETE | `/me/addresses/:addressId` | Auth | Delete an address |
| GET | `/` | Admin | List all users |
| GET | `/:id` | Admin | Get a user by id |
| PUT | `/:id` | Admin | Update a user |
| DELETE | `/:id` | Admin | Delete a user |

### Products — `/api/products`

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/` | Public | List products |
| GET | `/:id` | Public | Get a product |
| POST | `/` | Admin | Create a product |
| PUT | `/:id` | Admin | Update a product |
| DELETE | `/:id` | Admin | Delete a product |

### Categories — `/api/categories`

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/` | Public | List categories |
| GET | `/:id` | Public | Get a category |
| POST | `/` | Public | Create a category |
| PUT | `/:id` | Public | Update a category |
| DELETE | `/:id` | Public | Delete a category |

### Carts — `/api/carts`

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/` | Auth | Get current user's cart |
| POST | `/` | Auth | Add an item to the cart |
| PATCH | `/quantity/:productId` | Auth | Adjust item quantity by delta |
| PUT | `/` · POST `/edit` | Auth | Set item quantity directly |
| POST | `/remove` | Auth | Remove a single item |
| DELETE | `/` · POST `/clear` | Auth | Clear the entire cart |

### Orders — `/api/orders`

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| POST | `/checkout` | Auth | Create an order from the cart |
| GET | `/` | Auth | List own orders |
| GET | `/:orderId` | Auth | Get one of own orders |
| PUT | `/:orderId` | Auth | Update an order |
| GET | `/all` | Admin | List all orders |

### Admin — `/api/admin`

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/stats` | Admin | Dashboard statistics |
| GET | `/orders` | Admin | Admin order listing |
| GET | `/products` | Admin | Admin product listing |

## Testing the API

`.rest` files for the [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)
VS Code extension live in [src/testHTTP/](src/testHTTP/), covering auth, products,
categories, carts, and orders.
