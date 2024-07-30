import { logDuplicateArgumentNameError } from '../../utils/logs';
import type { InclusionContext } from '../ExecutionContext';
import type Identifier from '../nodes/Identifier';
import SpreadElement from '../nodes/SpreadElement';
import type { ExpressionEntity } from '../nodes/shared/Expression';
import FunctionBase from '../nodes/shared/FunctionBase';
import { EMPTY_PATH, UNKNOWN_PATH } from '../utils/PathTracker';
import ParameterVariable from '../variables/ParameterVariable';
import CatchBodyScope from './CatchBodyScope';
import ChildScope from './ChildScope';
import FunctionBodyScope from './FunctionBodyScope';

export default class ParameterScope extends ChildScope {
	readonly bodyScope: ChildScope;
	parameters: readonly ParameterVariable[][] = [];

	private hasRest = false;

	constructor(parent: ChildScope, isCatchScope: boolean) {
		super(parent, parent.context);
		this.bodyScope = isCatchScope ? new CatchBodyScope(this) : new FunctionBodyScope(this);
	}

	/**
	 * Adds a parameter to this scope. Parameters must be added in the correct
	 * order, i.e. from left to right.
	 */
	addParameterDeclaration(identifier: Identifier): ParameterVariable {
		const { name, start } = identifier;
		const existingParameter = this.variables.get(name);
		if (existingParameter) {
			return this.context.error(logDuplicateArgumentNameError(name), start);
		}
		const variable = new ParameterVariable(name, identifier, this.context);
		this.variables.set(name, variable);
		// We also add it to the body scope to detect name conflicts with local
		// variables. We still need the intermediate scope, though, as parameter
		// defaults are NOT taken from the body scope but from the parameters or
		// outside scope.
		this.bodyScope.addHoistedVariable(name, variable);
		return variable;
	}

	addParameterVariables(parameters: ParameterVariable[][], hasRest: boolean): void {
		this.parameters = parameters;
		for (const parameterList of parameters) {
			for (const parameter of parameterList) {
				parameter.alwaysRendered = true;
			}
		}
		this.hasRest = hasRest;
	}

	includeCallArguments(
		context: InclusionContext,
		arguments_: readonly (ExpressionEntity | SpreadElement)[]
	): void {
		let calledFromTryStatement = false;
		let argumentIncluded = false;
		const restParameter = this.hasRest && this.parameters[this.parameters.length - 1];
		for (const checkedArgument of arguments_) {
			if (checkedArgument instanceof SpreadElement) {
				for (const argument of arguments_) {
					argument.includePath(UNKNOWN_PATH, context, false);
				}
				break;
			}
		}
		for (let index = arguments_.length - 1; index >= 0; index--) {
			const parameterVariables = this.parameters[index] || restParameter;
			const argument = arguments_[index];
			if (parameterVariables) {
				calledFromTryStatement = false;
				if (parameterVariables.length === 0) {
					// handle empty destructuring
					argumentIncluded = true;
				} else {
					for (const variable of parameterVariables) {
						if (variable.included) {
							argumentIncluded = true;
						}
						if (variable.calledFromTryStatement) {
							calledFromTryStatement = true;
						}
					}
				}
			}
			if (!argumentIncluded && argument.shouldBeIncluded(context)) {
				argumentIncluded = true;
			}
			if (argumentIncluded) {
				argument.includePath(EMPTY_PATH, context, calledFromTryStatement);
			}
		}
		for (const functionEntity of context.includedCallArguments) {
			if (functionEntity instanceof FunctionBase) {
				for (const argument of functionEntity.argumentsToBeIncludedAll) {
					argument.includePath(UNKNOWN_PATH, context, false);
				}
			}
		}
	}
}
