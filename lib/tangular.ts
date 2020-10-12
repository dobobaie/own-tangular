enum TangularOperator {
  NONE = '',
  AND = '&',
  OR = '|',
  LESS_THAN = '<',
  GREATER_THAN = '>',
  EQUAL = '=',
  DOUBLE_EQUAL = '==',
  STRICT_EQUAL = '===',
  LESS_OR_EQUAL = '<=',
  GREATER_OR_EQUAL = '>=',
  NOT = '!',
  NOT_EQUAL = '!=',
  STRICT_NOT_EQUAL = '!==',
  IN = 'in',
  OF = 'of'
};

enum TangularPrivateKey {
  NONE = '',
  IF = 'if',
  ELSE = 'else',
  ELSEIF = 'else if',
  FI = 'fi',
  FOREACH = 'foreach',
  FOR = 'for',
  END = 'end',
  CONTINUE = 'continue',
  BREAK = 'break'
};

interface TangularProcessBloc {
  template: string;
  operator: TangularPrivateKey;
};

interface TangularInstruction {
  leftValue?: string;
  rightValue?: string;
  operator: TangularOperator,
  index: number
};

interface TangularCondition {
  values: Array<TangularCondition | TangularInstruction | string>,
  operator: TangularOperator,
  index: number
};

interface TangularBloc {
  name: TangularPrivateKey;
  children: TangularBloc[];
  instruction?: TangularCondition | TangularInstruction | string;
  isHTML?: boolean;
};

interface TangularNestedBlocs {
  lastIndex: number;
  blocObject: TangularBloc;
  blocsObject: TangularBloc[];
};

class Tangular {
  private _privateKeys: any = /^(if|else|fi|foreach|for|end|continue|break)\b/gm;
  private _helpers: any = {};

  constructor() {
    this._helpers.raw = <T>(value: T): T => value;
    this._helpers.encode = <T>(value: T): string | T =>
      (typeof value === 'string' &&
        value.replace(
          /[<>&"]/g,
          (character: string) => {
            switch (character) {
              case '&': return '&amp;';
              case '<': return '&lt;';
              case '>': return '&gt;';
              case '"': return '&quot;';
              default: return character;
            }
          }
        )
      ) || value
  }

  private _trim(str: string): string {
    return str.replace(/(\s\t|\t\s|\s\s|\t\t)+/gm, ' ').trim(); // TODO: except quote
  }
  
  private _unspace(str: string): string {
    return str.replace(/\s/gm, ''); // TODO: except quote
  }

  private _processForeachBuild(conditions: string): TangularCondition {
    const keys: string[] = conditions.split(' ');
    return {
      values: [
        keys[0],
        keys[2]
      ],
      operator: TangularOperator.IN,
      // index: conditions.length
      index: 0
    };
  }

  private _processConditionBuild(
    conditions: string,
    position: number = 0
  ): TangularCondition | TangularInstruction | string {
    let wordTmp: string = '';
    let instructionObject: TangularInstruction | undefined;
    let conditionsObject: TangularCondition = {
      values: [],
      operator: TangularOperator.NONE,
      index: 0
    };
  
    for (let i = position; i < conditions.length; i++) {
      conditionsObject.index = i;
      switch (conditions[i]) {
        case ')':
          if (wordTmp !== '') {
            if (instructionObject) {
              instructionObject.rightValue = wordTmp;
            }
            if (conditionsObject.operator === TangularOperator.NONE) {
              return instructionObject || wordTmp;
            }
            conditionsObject.values.push(instructionObject || wordTmp);
            instructionObject = undefined;
          }
          return conditionsObject;
        case '(':
          const conditionsObjectRec: TangularCondition | TangularInstruction | string =
            this._processConditionBuild(conditions, i + 1);
          conditionsObject.values.push(
            conditionsObjectRec
          );
          i = (<TangularCondition>conditionsObjectRec)?.index;
          wordTmp = '';
        break;
        case TangularOperator.AND:
        case TangularOperator.OR:
          if (wordTmp !== '') {
            conditionsObject.values.push(wordTmp);
          }
          conditionsObject = {
            values: [
              ...(conditionsObject.operator === TangularOperator.NONE
                || conditionsObject.operator === <TangularOperator>conditions[i]
                ? conditionsObject.values
                : [conditionsObject])
            ],
            operator: <TangularOperator>conditions[i],
            index: i
          };
          wordTmp = '';
        break;
        case TangularOperator.LESS_THAN:
        case TangularOperator.GREATER_THAN:
        case TangularOperator.EQUAL:
        case TangularOperator.NOT:
          instructionObject = instructionObject || {
            operator: TangularOperator.NONE,
            index: i
          };
          instructionObject.leftValue = instructionObject.leftValue || wordTmp;
          instructionObject.operator = ((instructionObject.operator === TangularOperator.DOUBLE_EQUAL && TangularOperator.STRICT_EQUAL) ||
            (instructionObject.operator === TangularOperator.EQUAL && TangularOperator.DOUBLE_EQUAL) ||
            (instructionObject.operator === TangularOperator.LESS_THAN && TangularOperator.LESS_OR_EQUAL) ||
            (instructionObject.operator === TangularOperator.GREATER_THAN && TangularOperator.GREATER_OR_EQUAL) ||
            (instructionObject.operator === TangularOperator.NOT_EQUAL && TangularOperator.STRICT_NOT_EQUAL) ||
            (instructionObject.operator === TangularOperator.NOT && TangularOperator.NOT_EQUAL) ||
            <TangularOperator>conditions[i]);
          wordTmp = '';
          break;
        default:
          wordTmp += conditions[i];
      }
    }
    if (wordTmp !== '') {
      if (instructionObject) {
        instructionObject.rightValue = wordTmp;
      }
      if (conditionsObject.operator === TangularOperator.NONE) {
        return instructionObject || wordTmp;
      }
      conditionsObject.values.push(instructionObject || wordTmp);
    }
    return conditionsObject;
  }

  private _processBuildPrivateKey(
    template: string,
    elements: IterableIterator<any>,
    returnNextKeyEnd: boolean = false,
    lastIndex: number = 0
  ): TangularBloc[] | TangularNestedBlocs {
    const tracking: { lastIndex: number } = { lastIndex };
    const blocsObject: TangularBloc[] = [];
    let blocObject: TangularBloc = {
      name: TangularPrivateKey.NONE,
      children: []
    };

    let element: any;
    while (!(element = elements.next()).done) {
      const value: string = element.value.shift();
      const sentence: string = this._trim(
        value.substring(2, value.length - 2)
      );
      const sentenceLength: number = value.length;

      // ---
      if (element.value.index !== tracking.lastIndex) {
        (blocObject.name === TangularPrivateKey.NONE
          ? blocsObject
          : blocObject.children
        ).push({
          name: TangularPrivateKey.NONE,
          children: [],
          instruction: template.substring(tracking.lastIndex, element.value.index),
          isHTML: true
        });
      }
      tracking.lastIndex = element.value.index + sentenceLength;

      // ---
      if (!sentence.match(this._privateKeys)) {
        if (blocObject.name === TangularPrivateKey.NONE) {
          blocsObject.push({
            name: TangularPrivateKey.NONE,
            children: [],
            instruction: this._unspace(sentence)
          });
          continue ;
        }
        blocObject.children.push({
          name: TangularPrivateKey.NONE,
          children: [],
          instruction: this._unspace(sentence)
        });
        continue ;
      }

      // ---
      const nextSpace: number = sentence.indexOf(' ');
      const instructionKey: string = sentence.substring(0, nextSpace === -1
          ? sentenceLength
          : nextSpace);
      switch (instructionKey) {
        case TangularPrivateKey.FOR:
        case TangularPrivateKey.FOREACH:
        case TangularPrivateKey.IF:
          const instruction: string = sentence.substring(instructionKey.length + 1, sentenceLength);
          const instructionUnspace: string = this._unspace(instruction);
          if ([
            TangularPrivateKey.FOR,
            TangularPrivateKey.FOREACH,
            TangularPrivateKey.IF
          ].includes(<TangularPrivateKey>blocObject.name)) {
            const blocs: TangularNestedBlocs = <TangularNestedBlocs>this._processBuildPrivateKey(
              template,
              elements,
              true,
              tracking.lastIndex
            );
            blocObject.children.push({
              name: <TangularPrivateKey>instructionKey,
              children: blocs.blocsObject,
              instruction: instructionKey === TangularPrivateKey.IF
                ? this._processConditionBuild(instructionUnspace)
                : this._processForeachBuild(instruction),
            });
            if (blocs.blocObject.name !== TangularPrivateKey.NONE) {
              blocObject.children.push(blocs.blocObject);
            }
            tracking.lastIndex = blocs.lastIndex;
            continue;
          }
          blocObject = {
            name: <TangularPrivateKey>instructionKey,
            children: [],
            instruction: instructionKey === TangularPrivateKey.IF
              ? this._processConditionBuild(instructionUnspace)
              : this._processForeachBuild(instruction)
          };
        break;
        case TangularPrivateKey.ELSE:
          const instructionelseif: string = this._unspace(
            sentence.substring(TangularPrivateKey.ELSEIF.length, sentenceLength)
          );
          const isElseIf: boolean = sentence.startsWith(TangularPrivateKey.ELSEIF);
          if (isElseIf) {
            blocsObject.push(blocObject);
          }
          blocObject = {
            name: isElseIf
              ? TangularPrivateKey.ELSEIF
              : TangularPrivateKey.ELSE,
            children: [],
            instruction: isElseIf
              ? this._processConditionBuild(instructionelseif)
              : undefined
          };
          if (isElseIf) {
            blocsObject.push(blocObject);
          }
        break;
        case TangularPrivateKey.CONTINUE:
        case TangularPrivateKey.BREAK:
          // blocObject.children.push({
          blocsObject.push({
            name: <TangularPrivateKey>instructionKey,
            children: []
          });
        break;
        case TangularPrivateKey.END:
        case TangularPrivateKey.FI:
          if (returnNextKeyEnd) {
            return {
              lastIndex: tracking.lastIndex,
              blocsObject,
              blocObject
            };
          }
          blocsObject.push(blocObject);
          blocObject = {
            name: TangularPrivateKey.NONE,
            children: [],
            instruction: undefined
          };
        break;
      }
    }

    // ---
    if (template && tracking.lastIndex !== template.length) {
      (blocObject.name === TangularPrivateKey.NONE
        ? blocsObject
        : blocObject.children
      ).push({
        name: TangularPrivateKey.NONE,
        children: [],
        instruction: template.substring(tracking.lastIndex, template.length),
        isHTML: true
      });
    }

    return blocsObject;
  }

  private _processSentence<T>(sentence: string, payload: any): T {
    const keys: string[] = sentence.split('|');
    if (keys[keys.length - 1] !== 'raw') {
      keys.push('encode');
    }
    return keys.reduce((accumulator: any, cval: string) => { // BE CAREFUL TYPE ANY
      if (cval[0] === '"' || cval[0] === '\'') {
        return cval.substring(1, cval.length - 1);
      }
      const isFunction: number = cval.indexOf('(');
      const safeVal: string = cval.substring(0, isFunction === -1
        ? cval.length
        : isFunction);
      const deepObject: any = safeVal
        .split('.')
        .reduce((object: any, key: string) =>
          object && object[key]
        , payload);
      const parameters: any[] = isFunction !== -1
        ? cval.substring(isFunction + 1, cval.length - 1).split(',')
        : [];

      if (!deepObject) {
        return this._helpers[safeVal] && this._helpers[safeVal](...[
          accumulator,
          ...parameters
        ]);
      }
      return isFunction !== -1
        ? deepObject(...[
            accumulator,
            ...parameters
          ])
        : deepObject;
    }, '');
  }

  private _processInstruction(
    instruction: TangularInstruction | string,
    payload: any
  ): boolean {
    if (!instruction || typeof instruction === 'string') {
      return !!this._processSentence<string>(instruction, payload);
    }
    switch (instruction.operator) {
      case TangularOperator.EQUAL:
      case TangularOperator.DOUBLE_EQUAL:
        return this._processSentence<string>(
          <string>instruction.leftValue,
          payload
        ) == this._processSentence<string>(
          <string>instruction.rightValue,
          payload
        );
      case TangularOperator.STRICT_EQUAL:
        return this._processSentence<string>(
          <string>instruction.leftValue,
          payload
        ) === this._processSentence<string>(
          <string>instruction.rightValue,
          payload
        );
      case TangularOperator.NOT:
        return !this._processSentence<string>(
          <string>instruction.rightValue,
          payload
        );
      case TangularOperator.NOT_EQUAL:
        return this._processSentence<string>(
          <string>instruction.leftValue,
          payload
        ) != this._processSentence<string>(
          <string>instruction.rightValue,
          payload
        );
      case TangularOperator.STRICT_NOT_EQUAL:
        return this._processSentence<string>(
          <string>instruction.leftValue,
          payload
        ) !== this._processSentence<string>(
          <string>instruction.rightValue,
          payload
        );
      case TangularOperator.LESS_THAN:
        return this._processSentence<string>(
          <string>instruction.leftValue,
          payload
        ) < this._processSentence<string>(
          <string>instruction.rightValue,
          payload
        );
      case TangularOperator.GREATER_THAN:
        return this._processSentence<string>(
          <string>instruction.leftValue,
          payload
        ) > this._processSentence<string>(
          <string>instruction.rightValue,
          payload
        );
      case TangularOperator.LESS_OR_EQUAL:
        return this._processSentence<string>(
          <string>instruction.leftValue,
          payload
        ) <= this._processSentence<string>(
          <string>instruction.rightValue,
          payload
        );
      case TangularOperator.GREATER_OR_EQUAL:
        return this._processSentence<string>(
          <string>instruction.leftValue,
          payload
        ) >= this._processSentence<string>(
          <string>instruction.rightValue,
          payload
        );
      default:
        return false;
    }
  }

  private _processCondition(
    condition: TangularCondition,
    payload: any
  ): boolean {
    switch (condition.operator) {
      case TangularOperator.OR:
        return condition.values.reduce((acc, cval) =>
          <any>(acc || this._processCondition(<TangularCondition>cval, payload))
        , false);
      case TangularOperator.AND:
        return condition.values.reduce((acc, cval) =>
          <any>(acc && this._processCondition(<TangularCondition>cval, payload))
        , true);
      case TangularOperator.NONE:
        return this._processCondition(
          <TangularCondition>condition.values.shift(),
          payload
        );
      default:
        return this._processInstruction(condition, payload);
    }
  }
  
  private _processEach(
    bloc: TangularBloc,
    payload: any
  ): string | undefined {
    const condition: TangularCondition =<TangularCondition>bloc.instruction;
    const key: string = <string>condition.values[0];
    const instruction: string = <string>condition.values[1];
    const value: any[] = this._processSentence<any[]>(
      instruction + '|raw',
      payload
    );

    switch (condition.operator) {
      case TangularOperator.IN:
        let tpl: string = '';
        for (const n in value) {
          const pBloc: TangularProcessBloc = this._processBloc(
            bloc.children,
            {
              ...payload,
              [key]: value[n],
              '$index': n
            }
          );
          // console.log('===========', pBloc);
          tpl += pBloc.template;
          if (pBloc.operator === TangularPrivateKey.BREAK) {
            break;
          }
        }
        return tpl;
      case TangularOperator.OF: // NECESSARY ?
      default:
        return undefined;
    }
  }

  private _processBloc(
    blocs: TangularBloc[],
    payload: any
  ): TangularProcessBloc {
    const process: any = {
      lastOperator: TangularOperator.NONE,
      lastReponse: false
    };
    return blocs.reduce(
      (processBloc: TangularProcessBloc, bloc: TangularBloc) => {
        if (processBloc.operator !== TangularPrivateKey.NONE) {
          return processBloc;
        }
        switch (bloc.name) {
          case TangularPrivateKey.IF:
            process.lastReponse = false;
            const responseCondIf: boolean = this._processCondition(
              <TangularCondition>bloc.instruction,
              payload
            );
            process.lastReponse = responseCondIf;
            // console.log('||||', bloc, responseCondIf);
            if (responseCondIf) {
              const pBloc: TangularProcessBloc = this._processBloc(bloc.children, payload);
              processBloc.template += pBloc.template;
              processBloc.operator = (pBloc.operator !== TangularPrivateKey.NONE && pBloc.operator) || processBloc.operator;
            }
          break;
          case TangularPrivateKey.ELSEIF:
            if (process.lastReponse === true) {
              break;
            }
            const responseCondElseIf: boolean = this._processCondition(
              <TangularCondition>bloc.instruction,
              payload
            );
            process.lastReponse = responseCondElseIf;
            // console.log('||||', bloc, responseCondElseIf);
            if (responseCondElseIf) {
              const pBloc2: TangularProcessBloc = this._processBloc(bloc.children, payload);
              processBloc.template += pBloc2.template;
              processBloc.operator = (pBloc2.operator !== TangularPrivateKey.NONE && pBloc2.operator) || processBloc.operator;
            }
          break;
          case TangularPrivateKey.ELSE:
              if (process.lastReponse === true) {
                break;
              }
              const pBloc3: TangularProcessBloc = this._processBloc(bloc.children, payload);
              processBloc.template += pBloc3.template;
              processBloc.operator = (pBloc3.operator !== TangularPrivateKey.NONE && pBloc3.operator) || processBloc.operator;
              // console.log('||||', bloc);
          break;
          case TangularPrivateKey.FOREACH:
          case TangularPrivateKey.FOR:
            const r3: string | undefined = this._processEach(
              bloc,
              payload
            );
            processBloc.template += r3;
            // console.log('==================', r3);
          break;
          case TangularPrivateKey.CONTINUE:
            // console.log(blocs)
            // console.log('CONTINUUUUUUUUUUUUUUUUUUUUE');
            processBloc.operator = TangularPrivateKey.CONTINUE;
          break;
          case TangularPrivateKey.BREAK:
            // console.log('BREAAAAAAAAAAAAAAAAAAAAk');
            processBloc.operator = TangularPrivateKey.BREAK;
          break;
          default:
            const response: string = bloc.isHTML === true
              ? <string>bloc.instruction
              : this._processSentence<string>(
                <string>bloc.instruction,
                payload
              );
            processBloc.template += response;
            // console.log(',,,', bloc, response);
        }
        process.lastOperator = bloc.name;
        return processBloc;
      }, {
        template: '',
        operator: TangularPrivateKey.NONE
      }
    );
  }

  public compile(template: string): Function {
    const elements: IterableIterator<any> = template.matchAll(/(?={{[^{])(.*?)(?<=}})/gm);
    const blocs: TangularBloc[] = <TangularBloc[]>this._processBuildPrivateKey(
      template,
      elements
    );
    return ((payload: any = {}, enableAsync: boolean = false): string =>
      this._processBloc(blocs, payload).template.replace(/^\s*[\r\n]/gm, '')
    );
  }

  public render(template: string, payload: any = {}): string {
    return this.compile(template)(payload);
  }

  public renderAsync(template: string, payload: any = {}): Promise<string> {
    return this.compile(template)(payload, true);
  }

  public register(name: string, callback: Function): this {
    this._helpers[name] = callback;
    return this;
  }
}

const tangular = new Tangular();
tangular.register('f', (...args: any[]) => {
  console.log('my args', ...args);
  return 'hello';
});
const tpl = tangular.compile(`
  {{if (((name1 & name2) | (name3 & name4)) & name5 & name6 | name7 & "toto") }}
    {{if name !== null & name2 !== "tutu" }}
      <div>NOT NULL</div>
    {{fi}}
    {{if name === null }}
      <div>NULL</div>
    {{ else }}
      <div>Hello there !</div>
    {{ fi }}
  {{fi}}

  {{if name === 'Anna' }}
  <div>OK</div>
  {{else if name === 'John'}}
  <div>OK {{ name }}</div>
  {{else if name === 'Jean'}}
  <div>OK</div>
  {{else}}
  <div>NO</div>
  {{fi}}
  
  {{foreach m in orders}}
    {{ if !m.name }}
      {{ continue }}
    {{ fi }}
    <div>
      <h2>Order num.{{m.number}} (current index: {{$index}})</h2>
      <div>{{m.name}}</div>
    </div>
    {{ if m.name === "MyName3" }}
      {{ break }}
    {{ fi }}
  {{end}}
  
  <p>{{ this.name() }}</p>
  <p>{{ toto | f(1, 2, 3) }}</p>
  <p>{{{ toto }}</p>
  <p>{{{ toto | raw}}}</p>
  <p>{{ toto + "tutu" }}</p>
`)({
  name: 'John',
  name3: 'Jean',
  name7: 'name7',
  orders: [{
    number: 'myNumber',
    name: 'MyName'
  }, {
    number: 'myNumber2'
  }, {
    number: 'myNumber3',
    name: 'MyName3'
  }, {
    number: 'myNumber4',
    name: 'MyName4'
  }],
  this: {
    name: () => 'MyFuckingName'
  },
  toto: '<b>I am toto?</b>'
});

console.log('limit=========================');
console.log(tpl);
// ---
tangular.register('currency', (value: any, decimals: any) => {
  return value.toFixed(decimals || 0);
});
tangular.register('plus', (value: any, count: any) => {
  return (value || 0) + (Number.parseInt(count, 10) || 1);
});
var output = tangular.render(`
<p>Hello {{name}} and {{name | raw}}!</p>
<div>{{ amount | currency }}</div>
<div>{{ amount | currency(2) }}</div>

<!-- MULTIPLE HELPERS -->
<div>{{ count | plus | plus(2) | plus | plus(3) }}</div>`, {
  amount: 1.2654548548,
  name: '<b>world</b>'
});
console.log(output);
