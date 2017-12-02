import { Subject } from 'rxjs';
import { toObservable, isEvent } from './utils';
import Validators from './validators';

export const FormHooks = 'change' | 'blur' | 'submit';

/**
 * Indicates that a FormControl is valid, i.e. that no errors exist in the input value.
 */
export const VALID = 'VALID';

/**
 * Indicates that a FormControl is invalid, i.e. that an error exists in the input value.
 */
export const INVALID = 'INVALID';

/**
 * Indicates that a FormControl is pending, i.e. that async validation is occurring and
 * errors are not yet available for the input value.
 */
export const PENDING = 'PENDING';

/**
 * Indicates that a FormControl is disabled, i.e. that the control is exempt from ancestor
 * calculations of validity or value.
 */
export const DISABLED = 'DISABLED';

/**
* @param {AbstractControl} control
* @param {(String|Number)[]|String} path
* @param {String} delimiter
*/
function _find(control, path, delimiter) {
  if (path == null) return null;
  if (!(path instanceof Array)) {
    path = path.split(delimiter);
  }
  if (path instanceof Array && (path.length === 0)) return null;
  return path.reduce((v, name) => {
    if (v instanceof FormGroup) {
      return v.controls[name] || null;
    }
    if (v instanceof FormArray) {
      return v.at(name) || null;
    }
    return null;
  }, control);
}
/**
* @param {{validators: Function|Function[]|null, asyncValidators: Function|Function[]|null, updateOn: 'change' | 'blur' | 'submit'}} validatorOrOpts
* @return {Boolean}
*/
function isOptionsObj(validatorOrOpts) {
  return validatorOrOpts != null && !Array.isArray(validatorOrOpts) &&
    typeof validatorOrOpts === 'object';
}
/**
* @param {Function} validator
* @return {Function}
*/
function normalizeValidator(validator) {
  if (validator.validate) {
    return (c) => validator.validate(c);
  }
  return validator;
}
/**
* @param {Function} validator
* @return {Function}
*/
function normalizeAsyncValidator(validator) {
  if (validator.validate) {
    return (c) => validator.validate(c);
  }
  return validator;
}
/**
* @param {Function[]} validators
* @return {Function|null}
*/
function composeValidators(validators) {
  return validators != null ? Validators.compose(validators.map(normalizeValidator)) : null;
}
/**
* @param {Function[]} validators
* @return {Function|null}
*/
function composeAsyncValidators(validators) {
  return validators != null ? Validators.composeAsync(validators.map(normalizeAsyncValidator)) :
                          null;
}
function coerceToValidator(validatorOrOpts) {
  const validator =
    (isOptionsObj(validatorOrOpts) ? validatorOrOpts.validators :
                                     validatorOrOpts);
  return Array.isArray(validator) ? composeValidators(validator) : validator || null;
}
function coerceToAsyncValidator(asyncValidator, validatorOrOpts) {
  const origAsyncValidator =
    (isOptionsObj(validatorOrOpts) ? validatorOrOpts.asyncValidators :
                                     asyncValidator);
  return Array.isArray(origAsyncValidator) ? composeAsyncValidators(origAsyncValidator) :
                                           origAsyncValidator || null;
}
export class FormArray {}
export class AbstractControl {
  /**
  * @param {Function|null} validator
  * @param {Function|null} asyncValidator
  */  
  constructor(validator, asyncValidator) {
    this.validator = validator;
    this.asyncValidator = asyncValidator;
    /**
     * A control is marked `touched` once the user has triggered
    * a `blur` event on it.
    */
    this.touched = false;
    /**
    * A control is `pristine` if the user has not yet changed
    * the value in the UI.
    *
    * Note that programmatic changes to a control's value will
    * *not* mark it dirty.
    */
    this.pristine = true;
    this._onDisabledChange = [];
    this.hasError = this.hasError.bind(this);
  }
  /**
  * Returns the update strategy of the `AbstractControl` (i.e.
  * the event on which the control will update itself).
  * Possible values: `'change'` (default) | `'blur'` | `'submit'`
  */
  get updateOn() {
    return this._updateOn ? this._updateOn : (this.parent ? this.parent.updateOn : 'change');
  }
  /**
  * A control is `dirty` if the user has changed the value
  * in the UI.
  *
  * Note that programmatic changes to a control's value will
  * *not* mark it dirty.
  * @return {Boolean} 
  */
  get dirty() { return !this.pristine; }
  /**
  * A control is `valid` when its `status === VALID`.
  *
  * In order to have this status, the control must have passed all its
  * validation checks.
  * @return {Boolean} 
  */
  get valid() { return this.status === VALID; }
  /**
  * A control is `invalid` when its `status === INVALID`.
  *
  * In order to have this status, the control must have failed
  * at least one of its validation checks.
  * @return {Boolean} 
  */
  get invalid() { return this.status === INVALID; }
  /**
  * The parent control.
  * * @return {FormGroup|FormArray} 
  */
  get parent() { return this._parent; }
  /**
  * A control is `untouched` if the user has not yet triggered
  * a `blur` event on it.
  * @return {Boolean}
  */
  get untouched() { return !this.touched; }
  /**
  * A control is `enabled` as long as its `status !== DISABLED`.
  *
  * In other words, it has a status of `VALID`, `INVALID`, or
  * `PENDING`.
  * @return {Boolean}
  */
  get enabled() { return this.status !== DISABLED; }
   /**
   * A control is disabled if it's status is `DISABLED`
   */
  get disabled() {
    return this.status === DISABLED;
  }
  /**
  * Retrieves the top-level ancestor of this control.
  * @return {AbstractControl}
  */
  get root() {
    let x = this;
    while (x._parent) {
      x = x._parent;
    }
    return x;
  }
  setInitialStatus() {
    if (this.disabled) {
      this.status = DISABLED;
    } else {
      this.status = VALID;
    }
  }
  /**
  * Disables the control. This means the control will be exempt from validation checks and
  * excluded from the aggregate value of any parent. Its status is `DISABLED`.
  *
  * If the control has children, all children will be disabled to maintain the model.
  * @param {{onlySelf: Boolean, emitEvent: Boolean}} opts
  * @return {void}
  */
  disable(opts = {}) {
    this.status = DISABLED;
    this.errors = null;
    this._forEachChild((control) => { control.disable({ onlySelf: true }); });
    this._updateValue();

    if (opts.emitEvent !== false) {
      this.valueChanges.next(this.value);
      this.statusChanges.next(this.status);
      if(this.root && this.root.updateDOM) {
        this.root.updateDOM.next();
      }
    }

    this._updateAncestors(!!opts.onlySelf);
    this._onDisabledChange.forEach(changeFn => changeFn(true));
  }
  /**
  * Enables the control. This means the control will be included in validation checks and
  * the aggregate value of its parent. Its status is re-calculated based on its value and
  * its validators.
  *
  * If the control has children, all children will be enabled.
  * @param {{onlySelf: Boolean, emitEvent: Boolean}} opts
  * @return {void}
  */
  enable(opts = {}) {
    this.status = VALID;
    this._forEachChild((control) => { control.enable({ onlySelf: true }); });
    this.updateValueAndValidity({ onlySelf: true, emitEvent: opts.emitEvent });
    this._updateAncestors(!!opts.onlySelf);
    this._onDisabledChange.forEach(changeFn => changeFn(false));
  }
  /**
  * Updates value, validity & status of the control & parent
  * @param {{onlySelf: Boolean, emitEvent: Booelan}} options
  */
  updateValueAndValidity(options = {}) {
    this.setInitialStatus();
    this._updateValue();
    if (this.enabled) {
      this.errors = this._runValidator();
      this.status = this._calculateStatus();
      if (this.status === VALID || this.status === PENDING) {
        this._runAsyncValidator(options.emitEvent);
      }
    }
    if (options.emitEvent !== false) {
      this.valueChanges.next(this.value);
      this.statusChanges.next(this.status);
      if(this.root && this.root.updateDOM) {
        this.root.updateDOM.next();
      }
    }
    if (this.parent && !options.onlySelf) {
      // Will look on to it
      this.parent.updateValueAndValidity(options.onlySelf, options.emitEvent);
    }
  }
  /**
  * Marks the control as `touched`.
  *
  * This will also mark all direct ancestors as `touched` to maintain
  * the model.
  * @param {{onlySelf: Boolean}} opts
  * @return {void}
  */
  markAsTouched(opts = {}) {
    this.touched = true;
    if (this._parent && !opts.onlySelf) {
      this._parent.markAsTouched(opts);
    }
  }
  /**
  * Marks the control as `pristine`.
  *
  * If the control has any children, it will also mark all children as `pristine`
  * to maintain the model, and re-calculate the `pristine` status of all parent
  * controls.
  * @param {{onlySelf: Boolean}} opts
  * @return {void}
  */
  markAsPristine(opts = {}) {
    this.pristine = true;
    this._pendingDirty = false;
    this._forEachChild((control) => { control.markAsPristine({onlySelf: true}); });
    if (this._parent && !opts.onlySelf) {
      this._parent._updatePristine(opts);
    }
  }
  /**
  * Marks the control as `untouched`.
  *
  * If the control has any children, it will also mark all children as `untouched`
  * to maintain the model, and re-calculate the `touched` status of all parent
  * controls.
  * @param {{onlySelf: Boolean}} opts
  * @return {void}
  */
  markAsUntouched(opts = {}) {
    this.touched = false;
    this._pendingTouched = false;
    this._forEachChild(
        (control) => { control.markAsUntouched({ onlySelf: true }); });
    if (this._parent && !opts.onlySelf) {
      this._parent._updateTouched(opts);
    }
  }
  /**
  * Marks the control as `dirty`.
  *
  * This will also mark all direct ancestors as `dirty` to maintain
  * the model.
  * @param {{onlySelf: Boolean}} opts
  * @return {void}
  */
  markAsDirty(opts = {}) {
    this.pristine = false;
    if (this._parent && !opts.onlySelf) {
      this._parent.markAsDirty(opts);
    }
  }
  /**
   * Sets the synchronous validators that are active on this control.  Calling
   * this will overwrite any existing sync validators.
   * @param {Function|Function[]|null} newValidator
   * @return {void}
   */
  setValidators(newValidator) {
    this.validator = coerceToValidator(newValidator);
  }
  /**
  * Sets errors on a form control.
  *
  * This is used when validations are run manually by the user, rather than automatically.
  *
  * Calling `setErrors` will also update the validity of the parent control.
  *
  * ### Example
  *
  * ```
  * const login = new FormControl("someLogin");
  * login.setErrors({
  *   "notUnique": true
  * });
  *
  * ```
  * @param {{onlySelf: boolean}} opts
  * @return {void}
  */
  setErrors(errors, opts = {}) {
    this.errors = errors;
    this._updateControlsErrors(opts.emitEvent !== false);
  }
  /**
  * Retrieves a child control given the control's name or path.
  *
  * Paths can be passed in as an array or a string delimited by a dot.
  *
  * To get a control nested within a `person` sub-group:
  *
  * * `this.form.get('person.name');`
  *
  * -OR-
  *
  * * `this.form.get(['person', 'name']);`
  * @param {(String|Number)[]|String} path
  * @return {AbstractControl|null}
  */
  get(path) { return _find(this, path, '.'); }
  /**
  * Returns error data if the control with the given path has the error specified. Otherwise
  * returns null or undefined.
  *
  * If no path is given, it checks for the error on the present control.
  * @param {String} errorCode
  * @param {(String|Number)[]|String} path
  */
  getError(errorCode, path) {
    const control = path ? this.get(path) : this;
    return control && control.errors ? control.errors[errorCode] : null;
  }
  /**
  * Returns true if the control with the given path has the error specified. Otherwise
  * returns false.
  *
  * If no path is given, it checks for the error on the present control.
  * @param {String} errorCode
  * @param {(String|Number)[]|String} path
  * @return {Booelan}
  */
  hasError(errorCode, path)  { return !!this.getError(errorCode, path); }
  /**
  * Empties out the sync validator list.
  */
  clearValidators() { this.validator = null; }
  /**
  * @param {FormGroup|FormArray} parent
  * @return {Void}
  */
  setParent(parent) { this._parent = parent; }
  /**
  * @param {Boolean} onlySelf
  */
  _updateAncestors(onlySelf) {
    if (this._parent && !onlySelf) {
      this._parent.updateValueAndValidity();
      this._parent._updatePristine();
      this._parent._updateTouched();
    }
  }
  /**
  * @param {String} status
  * @return {Booelan}
  */
  _anyControlsHaveStatus(status) {
    return this._anyControls((control) => control.status === status);
  }
  /**
  * @return {String}
  */
  _calculateStatus() {
    if (this._allControlsDisabled()) return DISABLED;
    if (this.errors) return INVALID;
    if (this._anyControlsHaveStatus(PENDING)) return PENDING;
    if (this._anyControlsHaveStatus(INVALID)) return INVALID;
    return VALID;
  }
  _runValidator() {
    return this.validator ? this.validator(this) : null;
  }
  /**
  * @param {Booelan} emitEvent
  * @return {void}
  */
  _runAsyncValidator(emitEvent) {
    if (this.asyncValidator) {
      this.status = PENDING;
      const obs = toObservable(this.asyncValidator(this));
      this._asyncValidationSubscription =
        obs.subscribe(errors => this.setErrors(errors, { emitEvent }));
    }
  }
  /**
  * @param {{onlySelf: boolean}} opts
  * @return {void}
  */
  _updatePristine(opts = {}) {
    this.pristine = !this._anyControlsDirty();
    if (this._parent && !opts.onlySelf) {
      this._parent._updatePristine(opts);
    }
  }
  /**
  * @param {{onlySelf: boolean}} opts
  * @return {void}
  */
  _updateTouched(opts = {}) {
    this.touched = this._anyControlsTouched();
    if (this._parent && !opts.onlySelf) {
      this._parent._updateTouched(opts);
    }
  }
  /**
  * @return {Boolean}
  */
  _anyControlsDirty() {
    return this._anyControls((control) => control.dirty);
  }
  /**
  * @return {Boolean}
  */
  _anyControlsTouched() {
    return this._anyControls((control) => control.touched);
  }
  /**
  * @param {Booelan} emitEvent
  * @return {void}
  */
  _updateControlsErrors(emitEvent) {
    this.status = this._calculateStatus();
    if (emitEvent) {
      this.statusChanges.next();
      if(this.root && this.root.updateDOM) {
        this.root.updateDOM.next();
      }
    }
    if (this._parent) {
      this._parent._updateControlsErrors(emitEvent);
    }
  }
  _initObservables() {
    this.valueChanges = new Subject();
    this.statusChanges = new Subject();
  }
  // Abstarct Methods
  /**
  * @param {Function} cb
  * @return {void}
  */
  _forEachChild(cb) {}
  _updateValue() {}
  _allControlsDisabled() {}
  _anyControls() {}
  reset(value, options) {};
  setValue() {}
  _registerOnCollectionChange(fn) { this._onCollectionChange = fn; }
  /**
  * @param {{validators: Function|Function[]|null, asyncValidators: Function|Function[]|null, updateOn: 'change' | 'blur' | 'submit'}} opts
  * @return {Void}
  */
  _setUpdateStrategy(opts) {
    if (isOptionsObj(opts) && opts.updateOn != null) {
      this._updateOn = opts.updateOn;
    }
  }
}
export class FormControl extends AbstractControl {
  constructor(formState, validatorOrOpts, asyncValidator) {
    super(coerceToValidator(validatorOrOpts), coerceToAsyncValidator(asyncValidator));
    this.formState = formState;
    this.validatorsOrOpts = validatorOrOpts;
    this.asyncValidator = asyncValidator;
    this._applyFormState(formState);
    this._setUpdateStrategy(validatorOrOpts);
    this.updateValueAndValidity({ onlySelf: true, emitEvent: false });
    this._initObservables();
    this.onChange = (event) => {
      console.log("event called", event.target.value,event.target.type )
      if(!this.dirty) {
        this.markAsDirty();
      }
      if(isEvent(event)) {
        switch(event.target.type) {
          case "checkbox":
            this.setValue(event.target.checked);
            break;
          case "select-multiple":
            if(event.target.options) {
              let options = event.target.options;
              var value = [];
              for (var i = 0, l = options.length; i < l; i++) {
                if (options[i].selected) {
                  value.push(options[i].value);
                }
              }
              this.setValue(value);
            } else {
              this.setValue(event.target.value);
            }
            break;
          default:
            this.setValue(event.target.value);
        }
      } else {
        this.setValue(event);
      }
    };
    this.onBlur = () => {
      if (!this.touched) {
        this.markAsTouched();
        this.root.updateDOM.next();
        // this._updateTouched();
      }
    };
  }
  /**
  * @param {Function} condition
  * @return {Boolean}
  */
  _anyControls(condition) { return false; }
  /**
  * @return {Boolean}
  */
  _allControlsDisabled() { return this.disabled; }
  /**
  * @param {{onlySelf: Boolean, emitEvent: Boolean}} options
  * @return {void}
  */
  setValue(value, options = {}) {
    this.value = this._pendingValue = value;
    this.updateValueAndValidity(options);
  }
  /**
  * @return {Boolean}
  */
  _isBoxedValue(formState) {
    return typeof formState === 'object' && formState !== null &&
        Object.keys(formState).length === 2 && 'value' in formState && 'disabled' in formState;
  }
  _applyFormState(formState) {
    if (this._isBoxedValue(formState)) {
      this.value = this._pendingValue = formState.value;
      if (formState.disabled) {
        this.disable({ onlySelf: true, emitEvent: false });
      } else {
        this.enable({ onlySelf: true, emitEvent: false });
      }
    } else {
      this.value = this._pendingValue = formState;
    }
  }
  /**
  * @param {{onlySelf: Boolean, emitEvent: Boolean}} options
  * @return {void}
  */
  reset(formState = null, options = {}) {
    this._applyFormState(formState);
    this.markAsPristine(options);
    this.markAsUntouched(options);
    this.setValue(this.value, options);
    this._pendingChange = false;
  }
}
export class FormGroup extends AbstractControl {
  constructor(controls, validatorOrOpts, asyncValidator) {
    super(coerceToValidator(validatorOrOpts), coerceToAsyncValidator(asyncValidator));
    this.controls = controls;
    this.validatorOrOpts = validatorOrOpts;
    this.asyncValidator = asyncValidator;
    this.updateDOM = new Subject();
    this._initObservables();
    this._setUpdateStrategy(validatorOrOpts);
    this._setUpControls();
    this.updateValueAndValidity({ onlySelf: true, emitEvent: false });
  }
  /**
  * @param {{(v: any, k: String) => void}} callback
  * @return {void}
  */
  _forEachChild(callback) {
    Object.keys(this.controls).forEach(k => callback(this.controls[k], k));
  }

  _onCollectionChange() {}
  /**
   * Check whether there is an enabled control with the given name in the group.
   *
   * It will return false for disabled controls. If you'd like to check for existence in the group
   * only, use {@link AbstractControl#get get} instead.
   * @param {String} controlName
   * @return {Boolean}
   */
  contains(controlName) {
    return this.controls.hasOwnProperty(controlName) && this.controls[controlName].enabled;
  }
  /**
  * @param {Function} condition
  * @return {Boolean}
  */
  _anyControls(condition) {
    let res = false;
    this._forEachChild((control, name) => {
      res = res || (this.contains(name) && condition(control));
    });
    return res;
  }
  _updateValue() {
    this.value = this._reduceValue();
  }
  _reduceValue() {
    return this._reduceChildren(
        {}, (acc, control, name) => {
          if (control.enabled || this.disabled) {
            acc[name] = control.value;
          }
          return acc;
        });
  }
  _reduceErrors() {
    return this._reduceChildren(
      {}, (acc, control, name) => {
        if (control.enabled || this.disabled) {
          acc[name] = control.errors;
        }
        return acc;
      });
  }
  /**
  * @param {Function} fn
  */
  _reduceChildren(initValue, fn) {
    let res = initValue;
    this._forEachChild(
        (control, name) => { res = fn(res, control, name); });
    return res;
  }
  _setUpControls() {
    this._forEachChild((control) => {
      control.setParent(this);
      control._registerOnCollectionChange(this._onCollectionChange);
    });
  }
  /**
  * @return {Boolean}
  */
  _allControlsDisabled() {
    for (const controlName of Object.keys(this.controls)) {
      if (this.controls[controlName].enabled) {
        return false;
      }
    }
    return Object.keys(this.controls).length > 0 || this.disabled;
  }
  /**
  * @param {{onlySelf: Boolean, emitEvent: Boolean}} options
  * @return {void}
  */
  reset(value = {}, options = {}) {
    this._forEachChild((control, name) => {
      control.reset(value[name], {onlySelf: true, emitEvent: options.emitEvent});
    });
    this.updateValueAndValidity(options);
    this._updatePristine(options);
    this._updateTouched(options);
  }
}