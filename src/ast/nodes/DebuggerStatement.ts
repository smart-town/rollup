import type * as NodeType from './NodeType';
import { StatementBase } from './shared/Node';

export default class DebuggerStatement extends StatementBase {
	type!: NodeType.tDebuggerStatement;

	hasEffects(): boolean {
		return true;
	}
}
