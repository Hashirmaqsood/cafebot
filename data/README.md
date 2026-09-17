# Data

Reference data the bot uses to answer questions, e.g. `menu.json`, `faq.json`, `hours.json`.

Keeping this as simple data files (JSON/CSV) keeps the project low-cost — no database needed to get started.

`orders.json` starts as an empty array and is written to by the backend (see `backend/orderStorage.js`) — every time a customer explicitly confirms an order (never a draft), a record with a unique `orderId`, `timestamp`, and `status` is appended to it.

Because confirmed orders include customer name, phone, and/or delivery address, `data/orders.json` is listed in `.gitignore` and should never be committed. It's recreated automatically (starting empty) the first time an order is confirmed if it doesn't already exist locally.
