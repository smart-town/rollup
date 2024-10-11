import type { ast } from '../../rollup/types';
import type * as NodeType from './NodeType';
import { NodeBase } from './shared/Node';

export default class JSXEmptyExpression extends NodeBase<ast.JSXEmptyExpression> {
	type!: NodeType.tJSXEmptyExpression;
}
