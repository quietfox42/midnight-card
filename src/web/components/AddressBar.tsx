import { CheckIcon, CopyIcon, ExclamationTriangleIcon, Pencil1Icon, ReloadIcon } from '@radix-ui/react-icons';
import { Button, Callout, Flex, IconButton, Popover, Skeleton, Text, TextField, Tooltip } from '@radix-ui/themes';
import { useState, type FormEvent } from 'react';
import { checkPrefix, PREFIX_ERROR_TEXT, PREFIX_MAX } from '../../shared/address';
import type { AppConfig } from '../lib/api';
import { useCopy } from '../lib/useCopy';

interface Props {
  config: AppConfig | null;
  configError: boolean;
  address: string | null;
  prefix: string | null;
  onChange: (prefix: string) => void;
  onNew: () => void;
}

export function AddressBar({ config, configError, address, prefix, onChange, onNew }: Props) {
  const [copied, copy] = useCopy();

  if (configError) {
    return (
      <div className="addressbar">
        <Callout.Root color="red" size="1">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>暂时连接不到服务器。请检查网络后刷新页面。</Callout.Text>
        </Callout.Root>
      </div>
    );
  }

  return (
    <div className="addressbar">
      <Text as="div" size="1" color="gray" mb="1">
        你的临时邮箱地址
      </Text>
      <Flex align="center" gap="2" wrap="wrap">
        <Skeleton loading={!address}>
          <button
            type="button"
            className="address"
            onClick={() => address && copy(address)}
            title="点击复制"
          >
            {address ?? 'loading@example.com'}
          </button>
        </Skeleton>
        <Flex gap="2" align="center">
          <Tooltip content={copied ? '已复制' : '复制地址'}>
            <IconButton
              size="2"
              variant="soft"
              aria-label="复制地址"
              disabled={!address}
              onClick={() => address && copy(address)}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </IconButton>
          </Tooltip>
          <Button size="2" variant="soft" disabled={!config} onClick={onNew}>
            <ReloadIcon /> 换新地址
          </Button>
          {config && prefix && (
            <CustomPrefix key={prefix} config={config} current={prefix} onSubmit={onChange} />
          )}
        </Flex>
      </Flex>
      <Text as="p" size="1" color="amber" mt="2" className="notice">
        <ExclamationTriangleIcon />
        地址是公开的：任何知道这个地址的人都能看到邮件。不要用于重要账号。邮件保留{' '}
        {config?.retentionHours ?? 24} 小时后自动删除。
      </Text>
    </div>
  );
}

function CustomPrefix({
  config,
  current,
  onSubmit,
}: {
  config: AppConfig;
  current: string;
  onSubmit: (prefix: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);

  const validate = (v: string) => {
    const err = checkPrefix(v, config.reserved);
    return err ? PREFIX_ERROR_TEXT[err] : null;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = value.trim().toLowerCase();
    const err = validate(v);
    setError(err);
    if (err) return;
    onSubmit(v);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <Button size="2" variant="soft" color="gray">
          <Pencil1Icon /> 自定义
        </Button>
      </Popover.Trigger>
      <Popover.Content width="340px" maxWidth="calc(100vw - 32px)">
        <form onSubmit={submit} noValidate>
          <Text as="label" htmlFor="prefix-input" size="2" weight="medium">
            自定义前缀
          </Text>
          <TextField.Root
            id="prefix-input"
            mt="2"
            value={value}
            maxLength={PREFIX_MAX}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={!!error}
            aria-describedby="prefix-help"
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            onBlur={() => value && setError(validate(value.trim().toLowerCase()))}
          >
            <TextField.Slot side="right">
              <Text size="2" color="gray">
                @{config.domain}
              </Text>
            </TextField.Slot>
          </TextField.Root>
          <Text as="p" id="prefix-help" size="1" mt="1" color={error ? 'red' : 'gray'}>
            {error ?? '3-32 位：小写字母、数字、点、下划线、连字符'}
          </Text>
          <Flex justify="end" gap="2" mt="3">
            <Popover.Close>
              <Button type="button" variant="soft" color="gray">
                取消
              </Button>
            </Popover.Close>
            <Button type="submit">使用此地址</Button>
          </Flex>
        </form>
      </Popover.Content>
    </Popover.Root>
  );
}
