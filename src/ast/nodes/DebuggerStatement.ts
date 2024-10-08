import type * as NodeType from './NodeType';
import { NodeBase } from './shared/Node';

export default class DebuggerStatement extends NodeBase {
	type!: NodeType.tDebuggerStatement;

	hasEffects(): boolean {
		return true;
	}
}
