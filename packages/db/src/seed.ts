import bcrypt from 'bcryptjs';
import { getPrisma } from './client.js';
import { generateQrToken } from '@arcade/lib';

const prisma = getPrisma();

async function main() {
  console.log('▶ seeding ifun-city demo tenant...');

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'ifun-city' },
    update: {},
    create: {
      name: 'iFun City',
      slug: 'ifun-city',
      locale: 'en',
      timezone: 'Asia/Kuala_Lumpur',
      settings: {
        sheetsId: null,
        whatsappOptInNoticeVersion: '1.0',
      },
    },
  });

  const adminHash = await bcrypt.hash('admin12345', 10);
  const managerHash = await bcrypt.hash('manager123', 10);
  const staffHash = await bcrypt.hash('staff1234', 10);

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@ifuncity.test' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@ifuncity.test',
      passwordHash: adminHash,
      role: 'admin',
      name: 'Demo Admin',
    },
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'manager@ifuncity.test' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'manager@ifuncity.test',
      passwordHash: managerHash,
      role: 'manager',
      name: 'Demo Manager',
    },
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'staff@ifuncity.test' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'staff@ifuncity.test',
      passwordHash: staffHash,
      role: 'staff',
      name: 'Demo Staff',
    },
  });

  // Resources (Roller-style)
  await prisma.resource.createMany({
    data: [
      { tenantId: tenant.id, name: 'Party Room A', capacity: 30, color: '#ef4444' },
      { tenantId: tenant.id, name: 'Party Room B', capacity: 30, color: '#3b82f6' },
      { tenantId: tenant.id, name: 'VR Arena', capacity: 8, color: '#a855f7' },
      { tenantId: tenant.id, name: 'Bowling Lanes 1-4', capacity: 32, color: '#10b981' },
    ],
    skipDuplicates: true,
  });

  // Sample party package
  const pkg = await prisma.partyPackage.create({
    data: {
      tenantId: tenant.id,
      name: 'Classic Birthday Party',
      description: 'Party room + 2hr unlimited play + cake + decoration',
      basePrice: 500,
      depositPct: 50,
      minGuests: 10,
      maxGuests: 30,
      durationMinutes: 180,
      cancellationPolicy: {
        nonRefundableDeposit: true,
        tiers: [
          { daysBefore: 7, refundPct: 100 },
          { daysBefore: 2, refundPct: 50 },
          { daysBefore: 0, refundPct: 0 },
        ],
      },
    },
  });

  await prisma.packageAddon.createMany({
    data: [
      { tenantId: tenant.id, packageId: pkg.id, name: 'Extra Cake', price: 80 },
      { tenantId: tenant.id, packageId: pkg.id, name: 'Themed Decoration', price: 150 },
      { tenantId: tenant.id, packageId: pkg.id, name: 'Goodie Bags (per child)', price: 15 },
    ],
  });

  // Loyalty program
  const program = await prisma.loyaltyProgram.create({
    data: {
      tenantId: tenant.id,
      name: 'iFun Rewards',
      earnRatePerRm: 1,
      expiryMonths: 12,
    },
  });

  await prisma.loyaltyTier.createMany({
    data: [
      { tenantId: tenant.id, programId: program.id, name: 'Bronze', minQualifyingPoints: 0 },
      { tenantId: tenant.id, programId: program.id, name: 'Silver', minQualifyingPoints: 500, perks: { discount: 5 } },
      { tenantId: tenant.id, programId: program.id, name: 'Gold', minQualifyingPoints: 2000, perks: { discount: 10 } },
      { tenantId: tenant.id, programId: program.id, name: 'Platinum', minQualifyingPoints: 5000, perks: { discount: 15, freeParty: true } },
    ],
  });

  await prisma.reward.createMany({
    data: [
      { tenantId: tenant.id, name: 'Free Game Token', pointsCost: 50 },
      { tenantId: tenant.id, name: 'Free Drink', pointsCost: 200 },
      { tenantId: tenant.id, name: 'Free Party Add-on (Cake)', pointsCost: 800 },
    ],
  });

  // Sample machines with QR tokens
  for (const m of [
    { name: 'Pac-Man', model: 'Bandai-Namco', zone: 'Zone A' },
    { name: 'Air Hockey 1', model: 'ICE', zone: 'Zone B' },
    { name: 'Basketball Shot', model: 'ICE', zone: 'Zone B' },
    { name: 'VR Pod 1', model: 'Oculus', zone: 'VR Arena' },
  ]) {
    await prisma.machine.create({
      data: {
        tenantId: tenant.id,
        qrToken: generateQrToken(),
        name: m.name,
        model: m.model,
        locationZone: m.zone,
      },
    });
  }

  // WhatsApp templates (placeholders — real Trengo hsm_ids would replace these)
  await prisma.waTemplate.createMany({
    data: [
      {
        tenantId: tenant.id,
        name: 'birthday_greeting',
        category: 'marketing',
        trengoHsmId: 'PLACEHOLDER_BIRTHDAY_HSM',
        body: 'Happy birthday {{name}}! Enjoy 20% off your next visit at iFun City.',
        variables: [{ key: 'name' }],
        approvedAt: new Date(),
      },
      {
        tenantId: tenant.id,
        name: 'booking_confirmation',
        category: 'utility',
        trengoHsmId: 'PLACEHOLDER_BOOKING_CONFIRM_HSM',
        body: 'Hi {{name}}, your booking on {{date}} for {{guests}} guests is confirmed. See you then!',
        variables: [{ key: 'name' }, { key: 'date' }, { key: 'guests' }],
        approvedAt: new Date(),
      },
      {
        tenantId: tenant.id,
        name: 'booking_reminder_48h',
        category: 'utility',
        trengoHsmId: 'PLACEHOLDER_REMINDER_48H_HSM',
        body: 'Reminder: your party at iFun City is in 48 hours, on {{date}}.',
        variables: [{ key: 'date' }],
        approvedAt: new Date(),
      },
      {
        tenantId: tenant.id,
        name: 'booking_reminder_24h',
        category: 'utility',
        trengoHsmId: 'PLACEHOLDER_REMINDER_24H_HSM',
        body: 'See you tomorrow! Your party at iFun City is at {{time}}.',
        variables: [{ key: 'time' }],
        approvedAt: new Date(),
      },
      {
        tenantId: tenant.id,
        name: 'post_event_feedback',
        category: 'utility',
        trengoHsmId: 'PLACEHOLDER_FEEDBACK_HSM',
        body: 'Thanks for celebrating with us! How was your experience? Reply 1-5.',
        approvedAt: new Date(),
      },
      {
        tenantId: tenant.id,
        name: 're_engagement',
        category: 'marketing',
        trengoHsmId: 'PLACEHOLDER_REENGAGE_HSM',
        body: 'We miss you! Come back for a free game token on your next visit.',
        approvedAt: new Date(),
      },
    ],
  });

  console.log('✓ seed complete. Login as admin@ifuncity.test / admin12345');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
