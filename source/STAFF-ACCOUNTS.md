# Staff accounts — ShopEasy 2.8.95

## Role rules

- **Manager:** the full-access store owner account. It manages products, categories, stock, orders, discounts, stories, customers, storefront branding, Settings, Audit, License, staff and its own login email/password.
- **Admin:** a restricted read-only overview account. It cannot create staff accounts or manage store data/settings.
- Admin accounts can be created **only inside the signed-in Manager interface** at `/admin/staff`. They are not bootstrapped from `.env` and cannot be created by the staff CLI.

## First setup or upgrade

1. Copy `.env.example` to `.env` only if you do not already have a local environment file. For an upgrade from a version that used `ADMIN_EMAIL` / `ADMIN_PASSWORD`, rename those entries to `MANAGER_EMAIL` / `MANAGER_PASSWORD` and add `MANAGER_NAME`. Never commit `.env`.
2. Run `npm start` from this project folder. On a new database, the full-access Manager is created automatically. On an old database, if `MANAGER_EMAIL` exactly matches the former `.env` bootstrap Admin and `MANAGER_PASSWORD` verifies against that account's existing password hash, that one legacy bootstrap account is upgraded to Manager; its password is not reset. If the email belongs to any other account or the password doesn't match, ShopEasy refuses the migration and does not change roles—use a different Manager email instead.
3. Open `http://localhost:3000`, sign in with the configured Manager email/password and open **Staff & account** from the Manager navigation.
4. Create an Admin with its full name, unique email and password. The Manager page lists Admin emails/names only; passwords and password hashes are never shown.

The environment variables are bootstrap inputs only. Once any Manager exists, subsequent starts ignore `MANAGER_*` values and do not reset the account. Change the Manager email or password from the authenticated **Staff & account** page; the current password is required, and other sessions/password-reset codes are invalidated.

## Recovery / remote deployment

`npm run staff:create -- manager --local` may be used only when the local project's existing `data/shop.db` file is present and no Manager exists. It refuses to create an empty database accidentally and will not create Admin accounts or a second Manager. For a remote Turso database, set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in your terminal and use `npm run staff:create -- manager` against the intended database. It displays a credential-free target label and requires typed target/role confirmation. Do not paste passwords or tokens into commands, chat, source files or release reports.

## Verify permissions before launch

Sign in separately with Manager and Admin. Manager should get HTTP 200 for `/admin/staff` and all store-management pages. Admin should get HTTP 403 for `/admin/staff`, products, categories, orders, stories, coupons, customers, branding, audit, license and settings; a direct Admin POST to staff-management routes must not create accounts or change credentials. Run the HTTP integration tests on a clean machine with dependencies installed. This release remains a QA candidate, not production-certified.

## Removing a restricted Admin account

Open **Staff & account**, expand **Remove account** in the row of the Admin, enter the current Manager password and submit **Delete Admin permanently**. The server checks the Manager role, CSRF token, rate limit, target ID and current password again. Only a row currently carrying `role='admin'` can be deleted. Sessions and password-reset data are revoked; historical order records are retained. This action cannot be undone.
