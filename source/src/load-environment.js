// Keep dotenv's bootstrap side effect ordered before modules that read process.env.
// Explicitly disable its informational/debug output; application logging is separate.
import dotenv from 'dotenv';

dotenv.config({ quiet: true, debug: false });
