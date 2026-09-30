import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in apps/worker/.env"
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const personas = [
  {
    email: "alice@audiotool.test",
    password: "Password123!",
    username: "alice_producer",
  },
  {
    email: "bob@audiotool.test",
    password: "Password123!",
    username: "bob_engineer",
  },
];

async function seed() {
  console.log("Seeding demo accounts (Alice & Bob)...");
  for (const p of personas) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: p.email,
      password: p.password,
      email_confirm: true,
      user_metadata: { username: p.username },
    });

    if (error) {
      if (/already registered/i.test(error.message) || /already exists/i.test(error.message)) {
        const { data: listData } = await supabase.auth.admin.listUsers();
        const existing = listData?.users?.find((u) => u.email === p.email);
        if (existing) {
          await supabase.auth.admin.updateUserById(existing.id, {
            password: p.password,
            email_confirm: true,
            user_metadata: { username: p.username },
          });
          console.log(`✓ Confirmed existing demo account: ${p.email}`);
        }
      } else {
        console.error(`✗ Error creating ${p.email}:`, error.message);
      }
    } else {
      console.log(`✓ Created demo account: ${p.email} (${data.user?.id})`);
    }
  }
  console.log("Done seeding demo accounts!");
}

seed().catch(console.error);
