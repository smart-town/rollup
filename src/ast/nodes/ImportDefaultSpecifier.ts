import type Identifier from './Identifier';
import type * as NodeType from './NodeType';
import { NodeBase } from './shared/Node';

export default class ImportDefaultSpecifier extends NodeBase {
	local!: Identifier;
	type!: NodeType.tImportDefaultSpecifier;

	protected applyDeoptimizations() {}
}
