import type { AstContext, default as Module } from '../../Module';
import { EMPTY_ARRAY } from '../../utils/blank';
import type { DeoptimizableEntity } from '../DeoptimizableEntity';
import type { HasEffectsContext, InclusionContext } from '../ExecutionContext';
import type { NodeInteraction, NodeInteractionCalled } from '../NodeInteractions';
import {
	INTERACTION_ACCESSED,
	INTERACTION_ASSIGNED,
	INTERACTION_CALLED
} from '../NodeInteractions';
import type ExportDefaultDeclaration from '../nodes/ExportDefaultDeclaration';
import type Identifier from '../nodes/Identifier';
import * as NodeType from '../nodes/NodeType';
import {
	deoptimizeInteraction,
	type ExpressionEntity,
	type LiteralValueOrUnknown,
	UNKNOWN_EXPRESSION,
	UNKNOWN_RETURN_EXPRESSION,
	UnknownValue
} from '../nodes/shared/Expression';
import type { Node } from '../nodes/shared/Node';
import type { VariableKind } from '../nodes/shared/VariableKinds';
import {
	EMPTY_PATH,
	type EntityPathTracker,
	IncludedPathTracker,
	type ObjectPath,
	UNKNOWN_PATH,
	UnknownKey
} from '../utils/PathTracker';
import Variable from './Variable';

export default class LocalVariable extends Variable {
	calledFromTryStatement = false;

	readonly declarations: (Identifier | ExportDefaultDeclaration)[];
	readonly module: Module;

	protected additionalInitializers: ExpressionEntity[] | null = null;
	// Caching and deoptimization:
	// We track deoptimization when we do not return something unknown
	protected deoptimizationTracker: EntityPathTracker;
	protected includedPathTracker = new IncludedPathTracker();
	private expressionsToBeDeoptimized: DeoptimizableEntity[] = [];

	constructor(
		name: string,
		declarator: Identifier | ExportDefaultDeclaration | null,
		private init: ExpressionEntity,
		/** if this is non-empty, the actual init is this path of this.init */
		protected initPath: ObjectPath,
		context: AstContext,
		readonly kind: VariableKind
	) {
		super(name);
		this.declarations = declarator ? [declarator] : [];
		this.deoptimizationTracker = context.deoptimizationTracker;
		this.module = context.module;
	}

	addDeclaration(identifier: Identifier, init: ExpressionEntity): void {
		this.declarations.push(identifier);
		this.markInitializersForDeoptimization().push(init);
	}

	consolidateInitializers(): void {
		if (this.additionalInitializers) {
			for (const initializer of this.additionalInitializers) {
				initializer.deoptimizePath(UNKNOWN_PATH);
			}
		}
	}

	deoptimizeArgumentsOnInteractionAtPath(
		interaction: NodeInteraction,
		path: ObjectPath,
		recursionTracker: EntityPathTracker
	): void {
		if (this.isReassigned) {
			deoptimizeInteraction(interaction);
			return;
		}
		recursionTracker.withTrackedEntityAtPath(
			path,
			this.init,
			() =>
				this.init.deoptimizeArgumentsOnInteractionAtPath(
					interaction,
					[...this.initPath, ...path],
					recursionTracker
				),
			undefined
		);
	}

	deoptimizePath(path: ObjectPath): void {
		if (
			this.isReassigned ||
			this.deoptimizationTracker.trackEntityAtPathAndGetIfTracked(path, this)
		) {
			return;
		}
		if (path.length === 0) {
			this.markReassigned();
			const expressionsToBeDeoptimized = this.expressionsToBeDeoptimized;
			this.expressionsToBeDeoptimized = EMPTY_ARRAY as unknown as DeoptimizableEntity[];
			for (const expression of expressionsToBeDeoptimized) {
				expression.deoptimizeCache();
			}
			this.init.deoptimizePath([...this.initPath, UnknownKey]);
		} else {
			this.init.deoptimizePath([...this.initPath, ...path]);
		}
	}

	getLiteralValueAtPath(
		path: ObjectPath,
		recursionTracker: EntityPathTracker,
		origin: DeoptimizableEntity
	): LiteralValueOrUnknown {
		if (this.isReassigned) {
			return UnknownValue;
		}
		return recursionTracker.withTrackedEntityAtPath(
			path,
			this.init,
			() => {
				this.expressionsToBeDeoptimized.push(origin);
				return this.init.getLiteralValueAtPath(
					[...this.initPath, ...path],
					recursionTracker,
					origin
				);
			},
			UnknownValue
		);
	}

	getReturnExpressionWhenCalledAtPath(
		path: ObjectPath,
		interaction: NodeInteractionCalled,
		recursionTracker: EntityPathTracker,
		origin: DeoptimizableEntity
	): [expression: ExpressionEntity, isPure: boolean] {
		if (this.isReassigned) {
			return UNKNOWN_RETURN_EXPRESSION;
		}
		return recursionTracker.withTrackedEntityAtPath(
			path,
			this.init,
			() => {
				this.expressionsToBeDeoptimized.push(origin);
				return this.init.getReturnExpressionWhenCalledAtPath(
					[...this.initPath, ...path],
					interaction,
					recursionTracker,
					origin
				);
			},
			UNKNOWN_RETURN_EXPRESSION
		);
	}

	hasEffectsOnInteractionAtPath(
		path: ObjectPath,
		interaction: NodeInteraction,
		context: HasEffectsContext
	): boolean {
		switch (interaction.type) {
			case INTERACTION_ACCESSED: {
				if (this.isReassigned) return true;
				return (
					!context.accessed.trackEntityAtPathAndGetIfTracked(path, this) &&
					this.init.hasEffectsOnInteractionAtPath([...this.initPath, ...path], interaction, context)
				);
			}
			case INTERACTION_ASSIGNED: {
				if (this.included) return true;
				if (path.length === 0) return false;
				if (this.isReassigned) return true;
				return (
					!context.assigned.trackEntityAtPathAndGetIfTracked(path, this) &&
					this.init.hasEffectsOnInteractionAtPath([...this.initPath, ...path], interaction, context)
				);
			}
			case INTERACTION_CALLED: {
				if (this.isReassigned) return true;
				return (
					!(
						interaction.withNew ? context.instantiated : context.called
					).trackEntityAtPathAndGetIfTracked(path, interaction.args, this) &&
					this.init.hasEffectsOnInteractionAtPath([...this.initPath, ...path], interaction, context)
				);
			}
		}
	}

	includePath(path: ObjectPath, context: InclusionContext): void {
		if (!this.includedPathTracker.includePathAndGetIfIncluded(path)) {
			super.includePath(path, context);
			for (const declaration of this.declarations) {
				// If node is a default export, it can save a tree-shaking run to include the full declaration now
				if (!declaration.included) declaration.includePath(EMPTY_PATH, context, false);
				let node = declaration.parent as Node;
				while (!node.included) {
					// We do not want to properly include parents in case they are part of a dead branch
					// in which case .include() might pull in more dead code
					node.included = true;
					if (node.type === NodeType.Program) break;
					node = node.parent as Node;
				}
			}
			// We need to make sure we include the correct path of the init
			// TODO Lukas what about path.length == 0?
			if (path.length > 0) {
				this.init.includePath([...this.initPath, ...path], context, false);
				this.additionalInitializers?.forEach(initializer =>
					initializer.includePath(path, context, false)
				);
			}
		}
	}

	// TODO Lukas do we need to consider the initPath here?
	includeCallArguments(context: InclusionContext, interaction: NodeInteractionCalled): void {
		if (this.isReassigned || context.includedCallArguments.has(this.init)) {
			for (const argument of interaction.args) {
				argument?.includePath(UNKNOWN_PATH, context, false);
			}
		} else {
			context.includedCallArguments.add(this.init);
			this.init.includeCallArguments(context, interaction);
			context.includedCallArguments.delete(this.init);
		}
	}

	markCalledFromTryStatement(): void {
		this.calledFromTryStatement = true;
	}

	markInitializersForDeoptimization(): ExpressionEntity[] {
		if (this.additionalInitializers === null) {
			this.additionalInitializers = [this.init];
			this.init = UNKNOWN_EXPRESSION;
			this.markReassigned();
		}
		return this.additionalInitializers;
	}
}
