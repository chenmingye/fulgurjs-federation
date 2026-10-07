import type { FormProps, FormActionType, UseFormReturnType, FormSchema } from '../types/form';
import type { NamePath, ValidateOptions } from 'ant-design-vue/lib/form/interface';
import type { DynamicProps } from '/#/utils';
import { handleRangeValue } from '../utils/formUtils';
import { ref, onUnmounted, unref, nextTick, watch } from 'vue';
import { isProdMode } from '/@/utils/env';
import { getDynamicProps, getValueType, getValueTypeBySchema } from '/@/utils';
export declare type ValidateFields = (nameList?: NamePath[], options?: ValidateOptions) => Promise<Recordable>;

type Props = Partial<DynamicProps<FormProps>>;

// 表单实例未就绪的两种口径：
// 1) 未注册但组件仍在：等待 register（真实就绪事件），不靠一次 nextTick 碰运气；
// 2) 组件已卸载仍未注册（异步离页/快速关闭）：挂起的操作显式失败，不吞错、不写死实例。
const FORM_NOT_READY_UNMOUNTED_MESSAGE =
  'The form instance has not been obtained: the component owning this useForm was unmounted before the form registered. ' +
  '现象：表单操作早于表单渲染发起，且所属组件在表单注册前卸载（异步离页/快速关闭）。\n' +
  '影响：本次表单操作被显式取消，不会写入任何实例。\n' +
  '修法：组件卸载后不要再调用 useForm 方法；若表单在 v-if 下可能不渲染，调用前先确认渲染条件。';

export function useForm(props?: Props): UseFormReturnType {
  const formRef = ref<Nullable<FormActionType>>(null);
  const loadedRef = ref<Nullable<boolean>>(false);

  // D38 就绪合同：register() 是唯一就绪事件。
  // onUnmounted 必须放在 useForm 所在的 setup 里（原实现挂在 register 内，
  // 而 register 由子组件 emit 触发、无活跃实例，清理从未真正执行过）。
  let isDisposed = false;
  let hasReadyWaiters = false;
  let resolveReady: ((form: FormActionType) => void) | null = null;
  let rejectReady: ((reason: Error) => void) | null = null;
  const readyPromise = new Promise<FormActionType>((resolve, reject) => {
    resolveReady = (form) => {
      hasReadyWaiters = false;
      resolveReady = null;
      rejectReady = null;
      resolve(form);
    };
    rejectReady = (reason) => {
      hasReadyWaiters = false;
      resolveReady = null;
      rejectReady = null;
      reject(reason);
    };
  });

  onUnmounted(() => {
    isDisposed = true;
    // 只在有等待者时 reject：无人等待的 promise 保持 pending（GC 随闭包回收），
    // 避免制造 unhandledrejection 噪音；有等待者时必须显式失败，不能挂死。
    if (hasReadyWaiters && rejectReady) {
      rejectReady(new Error(FORM_NOT_READY_UNMOUNTED_MESSAGE));
    }
    formRef.value = null;
    loadedRef.value = null;
  });

  async function getForm() {
    if (isDisposed) throw new Error(FORM_NOT_READY_UNMOUNTED_MESSAGE);
    const form = unref(formRef);
    if (!form) {
      // 未注册属于初始化窗口；等待 register，不调用会抛异常的 error()。
      const readyForm = await waitReadyForm();
      await nextTick();
      if (isDisposed) throw new Error(FORM_NOT_READY_UNMOUNTED_MESSAGE);
      return readyForm;
    }
    await nextTick();
    if (isDisposed) throw new Error(FORM_NOT_READY_UNMOUNTED_MESSAGE);
    return form as FormActionType;
  }

  function waitReadyForm(): Promise<FormActionType> {
    const registered = unref(formRef);
    if (registered) return Promise.resolve(registered as FormActionType);
    if (isDisposed) return Promise.reject(new Error(FORM_NOT_READY_UNMOUNTED_MESSAGE));
    hasReadyWaiters = true;
    return readyPromise;
  }

  function register(instance: FormActionType) {
    if (isDisposed) return;
    if (unref(loadedRef) && isProdMode() && instance === unref(formRef)) return;

    formRef.value = instance;
    loadedRef.value = true;
    resolveReady?.(instance);

    watch(
      () => props,
      () => {
        props && instance.setProps(getDynamicProps(props));
      },
      {
        immediate: true,
        deep: true,
      }
    );
  }

  const methods: FormActionType = {
    scrollToField: async (name: NamePath, options?: ScrollOptions | undefined) => {
      const form = await getForm();
      form.scrollToField(name, options);
    },
    setProps: async (formProps: Partial<FormProps>) => {
      const form = await getForm();
      form.setProps(formProps);
    },

    updateSchema: async (data: Partial<FormSchema> | Partial<FormSchema>[]) => {
      const form = await getForm();
      form.updateSchema(data);
    },

    resetSchema: async (data: Partial<FormSchema> | Partial<FormSchema>[]) => {
      const form = await getForm();
      form.resetSchema(data);
    },

    clearValidate: async (name?: string | string[]) => {
      const form = await getForm();
      form.clearValidate(name);
    },

    resetFields: async () => {
      getForm().then(async (form) => {
        await form.resetFields();
      });
    },

    removeSchemaByFiled: async (field: string | string[]) => {
      unref(formRef)?.removeSchemaByFiled(field);
    },

    // TODO promisify
    getFieldsValue: <T>() => {
      // 代码逻辑说明: VUEN-1341【流程】编码方式 流程节点编辑表单时，填写数据报错 包括用户组件、部门组件、省市区
      let values = unref(formRef)?.getFieldsValue() as T;
      if(values){
        Object.keys(values).map(key=>{
          if (values[key] instanceof Array) {
            // 代码逻辑说明: 【issues/4330】判断如果是对象数组，则不拼接
            let isObject = typeof (values[key][0] || '') === 'object';
            if (!isObject) {
              values[key] = values[key].join(',');
            }
          }
        });
      }
      return values;
    },

    setFieldsValue: async <T>(values: T) => {
      const form = await getForm();
      form.setFieldsValue<T>(values);
    },

    appendSchemaByField: async (schema: FormSchema, prefixField: string | undefined, first: boolean) => {
      const form = await getForm();
      form.appendSchemaByField(schema, prefixField, first);
    },

    submit: async (): Promise<any> => {
      const form = await getForm();
      return form.submit();
    },

    /**
     * 表单验证并返回表单值
     * @update:添加表单值转换逻辑
     * @updateBy:zyf
     * @updateDate:2021-09-02
     */
    validate: async (nameList?: NamePath[]): Promise<Recordable> => {
      const form = await getForm();
      let getProps = props || form.getProps;
      let values = form.validate(nameList).then((values) => {
        for (let key in values) {
          if (values[key] instanceof Array) {
            let valueType = getValueTypeBySchema(form.getSchemaByField(key)!, form);
            if (valueType === 'string') {
              values[key] = values[key].join(',');
            }
          }
        }
        //--@updateBy-begin----author:liusq---date:20210916------for:处理区域事件字典信息------
        return handleRangeValue(getProps, values);
        //--@updateBy-end----author:liusq---date:20210916------for:处理区域事件字典信息------
      });
      return values;
    },
    validateFields: async (nameList?: NamePath[], options?: ValidateOptions): Promise<Recordable> => {
      const form = await getForm();
      return form.validateFields(nameList, options);
    },
  };

  return [register, methods];
}
