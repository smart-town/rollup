import type { ast } from '../../rollup/types';
import type * as NodeType from './NodeType';
import { NodeBase } from './shared/Node';

export default class PrivateIdentifier extends NodeBase<ast.PrivateIdentifier> {
	name!: string;
	type!: NodeType.tPrivateIdentifier;
}
