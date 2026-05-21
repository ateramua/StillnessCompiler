/*---------------------------------------------------------------------------------------------
 *  Copyright (c) QuantumIDE contributors. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import type { IChatProgressMessage } from '../../../common/chatService/chatService.js';

/** In-chat agent activity line that remains visible while answer text streams below. */
export function agentActivityChatProgressMessage(label: string, shimmer = true): IChatProgressMessage {
	return {
		kind: 'progressMessage',
		content: new MarkdownString(label),
		shimmer,
		sticky: true,
	};
}
