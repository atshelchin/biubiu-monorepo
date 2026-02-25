/**
 * Token Airdrop Distribution - Complex PDA Application
 *
 * Demonstrates the three-mode input system with a complex multi-step form:
 * - Network & Token selection
 * - Distribution method (equal, weighted, custom)
 * - Recipient input (CSV, manual, ENS batch)
 * - Gas settings & scheduling
 * - Advanced options
 *
 * This showcases why guided/standard/expert modes matter for complex forms.
 */

import { createApp, z } from '@shelchin/pda';
import {
  networkSchema,
  tokenSchema,
  type NetworkConfig,
  type TokenConfig,
} from './send-transaction-app';

// ============================================================================
// Types & Schemas
// ============================================================================

export const distributionMethodSchema = z.enum(['equal', 'weighted', 'custom']);
export type DistributionMethod = z.infer<typeof distributionMethodSchema>;

export const recipientInputMethodSchema = z.enum(['csv', 'manual', 'ens']);
export type RecipientInputMethod = z.infer<typeof recipientInputMethodSchema>;

export const gasPrioritySchema = z.enum(['low', 'medium', 'high', 'custom']);
export type GasPriority = z.infer<typeof gasPrioritySchema>;

export const sigTypeSchema = z.enum(['eip-1559', 'legacy']);
export type SignatureType = z.infer<typeof sigTypeSchema>;

export const recipientSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address'),
  amount: z.string().optional(), // For custom distribution
  weight: z.number().optional(), // For weighted distribution
  label: z.string().optional(), // Optional label/name
});

export type Recipient = z.infer<typeof recipientSchema>;

// Combined network + token config (same as send-transaction)
export const networkTokenConfigSchema = z.object({
  network: networkSchema,
  token: tokenSchema,
});

export type NetworkTokenConfig = z.infer<typeof networkTokenConfigSchema>;

// Distribution configuration
export const distributionConfigSchema = z.object({
  method: distributionMethodSchema,
  totalAmount: z.string().describe('Total amount to distribute'),
  // For weighted distribution
  usePercentage: z.boolean().optional(),
});

export type DistributionConfig = z.infer<typeof distributionConfigSchema>;

// Recipient list configuration
export const recipientConfigSchema = z.object({
  inputMethod: recipientInputMethodSchema,
  recipients: z.array(recipientSchema).min(1, 'At least one recipient required'),
  // CSV-specific
  csvContent: z.string().optional(),
  hasHeader: z.boolean().optional(),
  // ENS-specific
  ensNames: z.array(z.string()).optional(),
});

export type RecipientConfig = z.infer<typeof recipientConfigSchema>;

// Gas settings
export const gasSettingsSchema = z.object({
  priority: gasPrioritySchema,
  maxFeeGwei: z.number().optional(), // For custom priority
  maxPriorityFeeGwei: z.number().optional(),
  gasLimit: z.number().optional(), // Override estimated gas
});

export type GasSettings = z.infer<typeof gasSettingsSchema>;

// Scheduling options
export const schedulingSchema = z.object({
  executeImmediately: z.boolean(),
  scheduledTime: z.string().optional(), // ISO datetime
  timezone: z.string().optional(),
});

export type Scheduling = z.infer<typeof schedulingSchema>;

// Advanced options
export const advancedOptionsSchema = z.object({
  batchSize: z.number().min(1).max(500).default(100),
  retryFailedTx: z.boolean().default(true),
  maxRetries: z.number().min(0).max(10).default(3),
  signatureType: sigTypeSchema.default('eip-1559'),
  useMultisig: z.boolean().default(false),
  multisigAddress: z.string().optional(),
  verifyContracts: z.boolean().default(true),
  dryRun: z.boolean().default(false),
  notifyOnComplete: z.boolean().default(true),
  notificationEmail: z.string().email().optional(),
});

export type AdvancedOptions = z.infer<typeof advancedOptionsSchema>;

// ============================================================================
// PDA Application
// ============================================================================

export const tokenAirdropApp = createApp({
  id: 'token-airdrop',
  name: 'Token Airdrop Distribution',
  description: 'Distribute tokens to multiple recipients with flexible configuration',
  version: '1.0.0',

  inputSchema: z.object({
    // Section 1: Network & Token
    config: networkTokenConfigSchema.describe('Network and token to distribute'),

    // Section 2: Distribution Method
    distribution: distributionConfigSchema.describe('How to distribute tokens'),

    // Section 3: Recipients
    recipients: recipientConfigSchema.describe('Who receives the tokens'),

    // Section 4: Gas Settings
    gas: gasSettingsSchema.describe('Transaction gas configuration'),

    // Section 5: Scheduling
    scheduling: schedulingSchema.describe('When to execute'),

    // Section 6: Advanced Options
    advanced: advancedOptionsSchema.describe('Advanced distribution settings'),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    summary: z.object({
      totalRecipients: z.number(),
      successfulTransfers: z.number(),
      failedTransfers: z.number(),
      totalAmountSent: z.string(),
      totalGasUsed: z.string(),
      executionTime: z.number(), // seconds
    }),
    transactions: z.array(
      z.object({
        recipient: z.string(),
        amount: z.string(),
        txHash: z.string().optional(),
        status: z.enum(['pending', 'confirmed', 'failed']),
        error: z.string().optional(),
        blockNumber: z.number().optional(),
      })
    ),
    explorerUrl: z.string().optional(),
  }),

  executor: async function* (input, ctx) {
    const { config, distribution, recipients, gas, scheduling, advanced } = input;
    const { network, token } = config;
    const recipientList = recipients.recipients;

    // Validation phase
    ctx.info(`🎯 Token Airdrop: ${token.symbol} on ${network.name}`);
    ctx.info(`📊 Distribution: ${distribution.method} to ${recipientList.length} recipients`);
    ctx.info(`💰 Total: ${distribution.totalAmount} ${token.symbol}`);

    // Calculate amounts per recipient
    const amounts = calculateDistribution(distribution, recipientList);
    const totalCalc = amounts.reduce((sum, a) => sum + parseFloat(a), 0);

    ctx.info(`📦 Batch size: ${advanced.batchSize}`);
    ctx.info(`⛽ Gas priority: ${gas.priority}`);

    if (advanced.dryRun) {
      ctx.info('🧪 DRY RUN MODE - No transactions will be sent');
    }

    // Confirmation with summary
    const summaryText = [
      `Network: ${network.name} (Chain ID: ${network.chainId})`,
      `Token: ${token.symbol} (${token.type})`,
      `Recipients: ${recipientList.length}`,
      `Total Amount: ${totalCalc.toFixed(6)} ${token.symbol}`,
      `Distribution: ${distribution.method}`,
      `Gas Priority: ${gas.priority}`,
      advanced.dryRun ? '⚠️ DRY RUN - No actual transactions' : '',
    ]
      .filter(Boolean)
      .join('\n');

    const confirmed = yield* ctx.confirm(`Ready to execute airdrop?\n\n${summaryText}`);

    if (!confirmed) {
      throw new Error('Airdrop cancelled by user');
    }

    // Execution phase
    const startTime = Date.now();
    const batches = chunkArray(recipientList, advanced.batchSize);
    const transactions: Array<{
      recipient: string;
      amount: string;
      txHash?: string;
      status: 'pending' | 'confirmed' | 'failed';
      error?: string;
      blockNumber?: number;
    }> = [];

    let successful = 0;
    let failed = 0;
    let totalGas = 0n;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNum = i + 1;
      const progress = Math.round(((i + 1) / batches.length) * 100);

      ctx.progress(
        progress,
        100,
        `Processing batch ${batchNum}/${batches.length} (${batch.length} recipients)`
      );

      for (let j = 0; j < batch.length; j++) {
        const recipient = batch[j];
        const amount = amounts[i * advanced.batchSize + j];
        const recipientIdx = i * advanced.batchSize + j + 1;

        ctx.info(
          `[${recipientIdx}/${recipientList.length}] Sending ${amount} ${token.symbol} to ${recipient.address.slice(0, 10)}...`
        );

        // Simulate transaction (with some failures for realism)
        await sleep(100 + Math.random() * 200);

        const shouldFail = !advanced.dryRun && Math.random() < 0.05; // 5% failure rate

        if (shouldFail) {
          failed++;
          transactions.push({
            recipient: recipient.address,
            amount,
            status: 'failed',
            error: 'Transaction reverted: insufficient gas',
          });
          ctx.info(`❌ Failed: ${recipient.address.slice(0, 10)}...`);
        } else {
          successful++;
          const txHash = advanced.dryRun
            ? undefined
            : `0x${generateRandomHex(64)}`;
          const gasUsed = token.type === 'native' ? 21000n : 65000n;
          totalGas += gasUsed;

          transactions.push({
            recipient: recipient.address,
            amount,
            txHash,
            status: 'confirmed',
            blockNumber: advanced.dryRun
              ? undefined
              : 19000000 + Math.floor(Math.random() * 100000),
          });
        }
      }

      // Batch delay to avoid rate limits
      if (i < batches.length - 1) {
        await sleep(500);
      }
    }

    const executionTime = (Date.now() - startTime) / 1000;

    ctx.info(`\n✅ Airdrop complete!`);
    ctx.info(`   Successful: ${successful}`);
    ctx.info(`   Failed: ${failed}`);
    ctx.info(`   Time: ${executionTime.toFixed(1)}s`);

    // Notification
    if (advanced.notifyOnComplete && advanced.notificationEmail) {
      ctx.info(`📧 Notification sent to ${advanced.notificationEmail}`);
    }

    const totalSent = amounts
      .slice(0, successful)
      .reduce((sum, a) => sum + parseFloat(a), 0);

    return {
      success: failed === 0,
      summary: {
        totalRecipients: recipientList.length,
        successfulTransfers: successful,
        failedTransfers: failed,
        totalAmountSent: totalSent.toFixed(6),
        totalGasUsed: totalGas.toString(),
        executionTime,
      },
      transactions,
      explorerUrl: network.explorerUrl,
    };
  },
});

// ============================================================================
// Helper Functions
// ============================================================================

function calculateDistribution(
  distribution: DistributionConfig,
  recipients: Recipient[]
): string[] {
  const total = parseFloat(distribution.totalAmount);

  switch (distribution.method) {
    case 'equal': {
      const perRecipient = total / recipients.length;
      return recipients.map(() => perRecipient.toFixed(6));
    }
    case 'weighted': {
      const totalWeight = recipients.reduce((sum, r) => sum + (r.weight || 1), 0);
      return recipients.map((r) => {
        const share = ((r.weight || 1) / totalWeight) * total;
        return share.toFixed(6);
      });
    }
    case 'custom': {
      return recipients.map((r) => r.amount || '0');
    }
    default:
      return recipients.map(() => '0');
  }
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateRandomHex(length: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// ============================================================================
// Type Exports
// ============================================================================

export type TokenAirdropInput = z.infer<typeof tokenAirdropApp.manifest.inputSchema>;
export type TokenAirdropOutput = z.infer<typeof tokenAirdropApp.manifest.outputSchema>;
