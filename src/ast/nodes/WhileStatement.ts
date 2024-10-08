import type { HasEffectsContext, InclusionContext } from '../ExecutionContext';
import { type ObjectPath, UNKNOWN_PATH } from '../utils/PathTracker';
import type * as NodeType from './NodeType';
import { hasLoopBodyEffects, includeLoopBody } from './shared/loops';
import {
	type ExpressionNode,
	type IncludeChildren,
	NodeBase,
	type StatementNode
} from './shared/Node';

export default class WhileStatement extends NodeBase {
	body!: StatementNode;
	test!: ExpressionNode;
	type!: NodeType.tWhileStatement;

	hasEffects(context: HasEffectsContext): boolean {
		if (this.test.hasEffects(context)) return true;
		return hasLoopBodyEffects(context, this.body);
	}

	includePath(
		_path: ObjectPath,
		context: InclusionContext,
		includeChildrenRecursively: IncludeChildren
	): void {
		this.included = true;
		this.test.includePath(UNKNOWN_PATH, context, includeChildrenRecursively);
		includeLoopBody(context, this.body, includeChildrenRecursively);
	}
}
