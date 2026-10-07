import { normalizePhone, isValidPhone } from "../src/lib/contactValidation";
import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Bootstraps the platform's root actor: a Super Admin, not a store owner.
// Stores (and their owners) are created afterwards through the Super Admin
// onboarding flow, not by this script. Set SEED_OWNER_PHONE to the verified
// personal login phone; SEED_OWNER_PASSWORD and SEED_OWNER_NAME are unchanged.
async function main() {
  const phone = process.env.SEED_OWNER_PHONE;
  const password = process.env.SEED_OWNER_PASSWORD;
  const name = process.env.SEED_OWNER_NAME ?? "Super Admin";

  if (!phone || !password) {
    throw new Error(
      "Set SEED_OWNER_PHONE and SEED_OWNER_PASSWORD before seeding, e.g.\n" +
        "SEED_OWNER_PHONE=919876543210 SEED_OWNER_PASSWORD=change-me npx prisma db seed",
    );
  }

  const normalizedPhone = normalizePhone(phone);
  if (!isValidPhone(normalizedPhone)) throw new Error('SEED_OWNER_PHONE must contain 8–15 digits.');
  const passwordHash = await bcrypt.hash(password, 12);

  const paymentDefaults = [
    { code: "COD", name: "Cash on delivery", enabledByDefault: true, defaultStage: "PRE_ORDER" as const },
    { code: "CASH", name: "Cash", enabledByDefault: true, defaultStage: "POST_ORDER" as const },
    { code: "UPI", name: "UPI", enabledByDefault: true, defaultStage: "BOTH" as const },
  ];
  const messageDefaults = [
    { statusKey: "PENDING" as const, body: "Hi {customer}, we received your order {orderNo} at {store}. Total: ₹{total}. Expected delivery: {dueDate}. Details: {link}", defaultEnabled: false, defaultAttachment: "NONE" as const },
    { statusKey: "IN_PROGRESS" as const, body: "Hi {customer}, your order {orderNo} at {store} is being processed. We will let you know when it is ready.", defaultEnabled: false, defaultAttachment: "NONE" as const },
    { statusKey: "READY" as const, body: "Hi {customer}, your laundry order {orderNo} at {store} is ready for delivery. Amount due: ₹{due}. Order details: {link}. Thank you.", defaultEnabled: true, defaultAttachment: "ORDER_SLIP_PDF" as const },
    { statusKey: "DELIVERED" as const, body: "Hi {customer}, your order {orderNo} from {store} was delivered on {date}. Total paid: ₹{total} via {method}. Invoice {invoiceNo}: {link}. Thank you for choosing {store}.", defaultEnabled: true, defaultAttachment: "INVOICE_PDF" as const },
  ];

  await prisma.$transaction([
    ...paymentDefaults.map(method => prisma.platformPaymentMethod.upsert({
      where: { code: method.code },
      update: { enabledByDefault: method.enabledByDefault, defaultStage: method.defaultStage },
      create: method,
    })),
    ...messageDefaults.map(template => prisma.platformMessageTemplate.upsert({
      where: { statusKey: template.statusKey },
      update: {},
      create: template,
    })),
  ]);

  const superAdmin = await prisma.user.upsert({
    where: { phone: normalizedPhone },
    update: {},
    create: { name, phone: normalizedPhone, passwordHash, isSuperAdmin: true },
  });

  console.log(`Super Admin user ready: ${superAdmin.phone} (id: ${superAdmin.id})`);
  console.log('Platform payment and message defaults ready.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
