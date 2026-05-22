/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { bootstrapWebWorker } from '../../../../../base/common/worker/webWorkerBootstrap.js';
import { create } from './quantumideIndexerCpu.worker.js';

bootstrapWebWorker(create);
