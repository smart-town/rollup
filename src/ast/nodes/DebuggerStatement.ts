import type { ast } from '../../rollup/types';
import type * as NodeType from './NodeType';
import { NodeBase } from './shared/Node';

export default class DebuggerStatement extends NodeBase<ast.DebuggerStatement> {
	type!: NodeType.tDebuggerStatement;

	hasEffects(): boolean {
		return true;
	}
}
