import { createTaskHub, computeMerkleRoot, generateJobId } from '@shelchin/taskhub/browser';
import { createBalanceRadarApp } from '../index.js';

export const app = createBalanceRadarApp({ createTaskHub, computeMerkleRoot, generateJobId });
export const layout = 'vertical' as const;
